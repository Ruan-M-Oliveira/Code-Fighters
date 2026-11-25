(function (global) {
  'use strict';

  /**
   * Leaderboard — the local arcade Top 3.
   * Entries: { id, name, score, wave, date }. Persisted in localStorage;
   * any missing / corrupted / tampered data is sanitised instead of crashing.
   * A run is identified by its id, so recording the same run twice (victory,
   * then death in endless mode) updates its entry instead of duplicating it.
   */
  var KEY = 'codefighters_top3_v1';
  var NAME_KEY = 'codefighters_callsign_v1';
  var SIZE = 3;
  var NAME_MIN = 3, NAME_MAX = 10;

  function safeRead(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeWrite(key, val) {
    try { global.localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  /** Uppercase A-Z, 0-9, '-' and '_' only (arcade style). */
  function cleanName(s) {
    var t = String(s == null ? '' : s).toUpperCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');   // JOÃO -> JOAO
    return t.replace(/[^A-Z0-9_-]/g, '').slice(0, NAME_MAX);
  }

  function validName(s) {
    var c = cleanName(s);
    return c.length >= NAME_MIN && c.length <= NAME_MAX;
  }

  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var name = cleanName(e.name);
    var score = Math.floor(Number(e.score));
    if (name.length < 1 || !isFinite(score) || score < 0) return null;
    return {
      id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : 'legacy-' + name + '-' + score,
      name: name,
      score: Math.min(score, 999999999),
      wave: Math.max(0, Math.floor(Number(e.wave)) || 0),
      date: typeof e.date === 'string' ? e.date.slice(0, 30) : ''
    };
  }

  function sortEntries(list) {
    // highest score first; on a tie the older entry keeps the higher rank
    list.sort(function (a, b) { return b.score - a.score || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
    return list;
  }

  var Leaderboard = {
    entries: [],
    NAME_MIN: NAME_MIN,
    NAME_MAX: NAME_MAX,
    cleanName: cleanName,
    validName: validName,

    load: function () {
      var list = [];
      var raw = safeRead(KEY);
      if (raw) {
        try {
          var data = JSON.parse(raw);
          var arr = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : []);
          for (var i = 0; i < arr.length; i++) {
            var e = sanitizeEntry(arr[i]);
            if (e) list.push(e);
          }
        } catch (err) { list = []; /* corrupted JSON: start clean but don't overwrite until a new score arrives */ }
      }
      this.entries = sortEntries(list).slice(0, SIZE);
      return this.entries;
    },

    _persist: function () {
      safeWrite(KEY, JSON.stringify({ version: 1, entries: this.entries }));
    },

    /** Rank (1..3) the score would get right now, or 0. */
    projectedRank: function (score, ignoreId) {
      var rank = 1;
      for (var i = 0; i < this.entries.length; i++) {
        var e = this.entries[i];
        if (ignoreId && e.id === ignoreId) continue;
        if (score > e.score) break;
        rank++;
      }
      return rank <= SIZE && score > 0 ? rank : 0;
    },

    /**
     * Records a finished run. Calling it again with the same runId only
     * raises that run's score. Returns { rank, entry, isFirst, previousTop }.
     */
    submit: function (runId, name, score, wave) {
      // attract-mode runs must never reach storage, whoever calls this
      if (global.Game && global.Game.isDemoMode) return { rank: 0, entry: null, isFirst: false, previousTop: 0 };
      this.load();                                   // another tab may have written meanwhile
      score = Math.max(0, Math.floor(Number(score) || 0));
      var previousTop = this.entries.length ? this.entries[0].score : 0;
      var list = this.entries.slice();
      var existing = null, i;
      for (i = 0; i < list.length; i++) if (list[i].id === runId) existing = list[i];
      if (existing) {
        if (score > existing.score) { existing.score = score; existing.wave = Math.max(existing.wave, wave || 0); }
      } else if (score > 0) {
        list.push({ id: runId, name: cleanName(name) || 'PILOTO', score: score, wave: wave || 0, date: new Date().toISOString() });
      }
      list = sortEntries(list).slice(0, SIZE);
      this.entries = list;
      this._persist();
      var rank = 0;
      for (i = 0; i < list.length; i++) if (list[i].id === runId) rank = i + 1;
      return { rank: rank, entry: rank ? list[rank - 1] : null, isFirst: rank === 1, previousTop: previousTop };
    },

    clear: function () {
      this.entries = [];
      this._persist();
    },

    lastCallsign: function () {
      var n = cleanName(safeRead(NAME_KEY) || '');
      return n.length >= NAME_MIN ? n : '';
    },

    saveCallsign: function (n) {
      safeWrite(NAME_KEY, cleanName(n));
    }
  };

  Leaderboard.load();
  global.Leaderboard = Leaderboard;
}(typeof window !== 'undefined' ? window : this));
