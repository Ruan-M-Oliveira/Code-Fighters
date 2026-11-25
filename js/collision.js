(function (window) {
  'use strict';

  function tierColor(proj) {
    if (proj.pal) return proj.pal.color;              // ship-specific weapon colour
    var T = window.WEAPON_TIERS && window.WEAPON_TIERS[proj.tier || 1];
    return T ? T.color : '#ffff00';
  }
  // heavy weapons (Striker plasma) hit with a bigger impact burst
  function impactTier(proj) {
    return Math.min(5, (proj.tier || 1) + (proj.heavy ? 2 : 0));
  }
  function projAngle(proj) {
    return proj._angle !== undefined ? proj._angle : Math.atan2(proj.vy || 0, proj.vx || 1);
  }

  function CollisionManager() {
    this.collisionEvents = [];
  }

  CollisionManager.prototype.circleCollision = function (a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    return dist < (a.radius + b.radius);
  };

  CollisionManager.prototype.checkAll = function (
    player,
    enemies,
    asteroids,
    projectiles,
    powerups,
    boss,
    particleSystem,
    audioManager
  ) {
    var self = this;
    var playerProjectiles = [];
    var enemyProjectiles = [];

    if (projectiles && projectiles.length) {
      for (var i = 0; i < projectiles.length; i++) {
        var p = projectiles[i];
        if (!p || !p.active) continue;
        if (p.owner === 'player') {
          playerProjectiles.push(p);
        } else {
          enemyProjectiles.push(p);
        }
      }
    }

    // 1. Player projectiles vs enemies
    if (enemies && enemies.length && playerProjectiles.length) {
      for (var pi = 0; pi < playerProjectiles.length; pi++) {
        var proj = playerProjectiles[pi];
        if (!proj.active) continue;
        for (var ei = 0; ei < enemies.length; ei++) {
          var enemy = enemies[ei];
          if (!enemy || !enemy.active) continue;
          if (self.circleCollision(proj, enemy)) {
            self.handlePlayerProjectileVsEnemy(proj, enemy, player, particleSystem, audioManager);
            if (!proj.piercing) break;
          }
        }
      }
    }

    // 2. Player projectiles vs asteroids
    if (asteroids && asteroids.length && playerProjectiles.length) {
      for (var pi2 = 0; pi2 < playerProjectiles.length; pi2++) {
        var proj2 = playerProjectiles[pi2];
        if (!proj2.active) continue;
        for (var ai = 0; ai < asteroids.length; ai++) {
          var asteroid = asteroids[ai];
          if (!asteroid || !asteroid.active) continue;
          if (self.circleCollision(proj2, asteroid)) {
            self.handlePlayerProjectileVsAsteroid(proj2, asteroid, player, particleSystem, audioManager);
            break;
          }
        }
      }
    }

    // 3. Player vs enemies (contact damage)
    if (player && player.active && enemies && enemies.length) {
      for (var ei2 = 0; ei2 < enemies.length; ei2++) {
        var enemy2 = enemies[ei2];
        if (!enemy2 || !enemy2.active) continue;
        if (self.circleCollision(player, enemy2)) {
          self.handlePlayerVsEnemy(player, enemy2, particleSystem, audioManager);
        }
      }
    }

    // 3b. Player vs boss body (contact damage)
    if (player && player.active && boss && boss.active && self.circleCollision(player, boss)) {
      self.handlePlayerVsEnemy(player, boss, particleSystem, audioManager);
    }

    // 4. Player vs asteroids (contact damage)
    if (player && player.active && asteroids && asteroids.length) {
      for (var ai2 = 0; ai2 < asteroids.length; ai2++) {
        var asteroid2 = asteroids[ai2];
        if (!asteroid2 || !asteroid2.active) continue;
        if (self.circleCollision(player, asteroid2)) {
          self.handlePlayerVsAsteroid(player, asteroid2, particleSystem, audioManager);
        }
      }
    }

    // 5. Enemy projectiles vs player
    if (player && player.active && enemyProjectiles.length) {
      for (var epi = 0; epi < enemyProjectiles.length; epi++) {
        var eproj = enemyProjectiles[epi];
        if (!eproj.active) continue;
        if (self.circleCollision(eproj, player)) {
          self.handleEnemyProjectileVsPlayer(eproj, player, particleSystem, audioManager);
        }
      }
    }

    // 6. Boss projectiles vs player
    if (player && player.active && boss && boss.active) {
      var bossProjectiles = boss.projectiles || [];
      for (var bpi = 0; bpi < bossProjectiles.length; bpi++) {
        var bproj = bossProjectiles[bpi];
        if (!bproj || !bproj.active) continue;
        if (self.circleCollision(bproj, player)) {
          self.handleEnemyProjectileVsPlayer(bproj, player, particleSystem, audioManager);
        }
      }
    }

    // 7. Power-ups vs player
    if (player && player.active && powerups && powerups.length) {
      var powerUpEffects = window.powerUpEffects || {};
      for (var pui = 0; pui < powerups.length; pui++) {
        var powerup = powerups[pui];
        if (!powerup || !powerup.active) continue;
        if (self.circleCollision(powerup, player)) {
          self.handlePowerUpVsPlayer(powerup, player, powerUpEffects, audioManager);
        }
      }
    }

    // 8. Player projectiles vs boss
    if (boss && boss.active && playerProjectiles.length) {
      for (var pi3 = 0; pi3 < playerProjectiles.length; pi3++) {
        var proj3 = playerProjectiles[pi3];
        if (!proj3.active) continue;
        if (self.circleCollision(proj3, boss)) {
          self.handlePlayerProjectileVsBoss(proj3, boss, player, particleSystem, audioManager);
        }
      }
    }
  };

  CollisionManager.prototype.handlePlayerProjectileVsEnemy = function (
    proj,
    enemy,
    player,
    particleSystem,
    audioManager
  ) {
    if (!proj.piercing) {
      proj.active = false;
    }

    var damage = proj.damage || 1;
    var wasDead = !enemy.active || (enemy.health !== undefined && enemy.health <= 0);

    if (typeof enemy.takeDamage === 'function') {
      enemy.takeDamage(damage);
    } else if (enemy.health !== undefined) {
      enemy.health -= damage;
      if (enemy.health <= 0) {
        enemy.active = false;
      }
    }

    var isDead = !enemy.active || (enemy.health !== undefined && enemy.health <= 0);

    if (!wasDead && isDead) {
      if (player) {
        var scoreValue = enemy.scoreValue || enemy.score || 100;
        if (typeof player.addScore === 'function') {
          player.addScore(scoreValue);
        } else if (player.score !== undefined) {
          player.score += scoreValue;
        }

        if (typeof player.incrementCombo === 'function') {
          player.incrementCombo();
        } else if (player.combo !== undefined) {
          player.combo = (player.combo || 0) + 1;
        }
      }

      if (particleSystem && typeof particleSystem.emitExplosion === 'function') {
        particleSystem.emitExplosion(enemy.x, enemy.y, {
          count: 20,
          color: enemy.explosionColor || '#ff6600',
          size: enemy.radius || 10
        });
      }

      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('enemyExplode');
      }
    } else {
      if (particleSystem && typeof particleSystem.emitImpact === 'function') {
        particleSystem.emitImpact(proj.x, proj.y, projAngle(proj), impactTier(proj), tierColor(proj));
      } else if (particleSystem && typeof particleSystem.emit === 'function') {
        particleSystem.emit(proj.x, proj.y, { count: 5, color: '#ffff00', size: 3 });
      }
      // hit reaction: a small shove along the shot direction
      var push = 1.5 + (proj.tier || 1) * 0.35;
      var pa = projAngle(proj);
      enemy.x += Math.cos(pa) * push;
      enemy.y += Math.sin(pa) * push;
      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('hit');
      }
    }
    if (!wasDead && isDead && (proj.tier || 1) >= 3 && particleSystem && particleSystem.emitImpact) {
      particleSystem.emitImpact(proj.x, proj.y, projAngle(proj), proj.tier, tierColor(proj));
    }

    this.logEvent('proj_vs_enemy', proj.x, proj.y);
  };

  CollisionManager.prototype.handlePlayerProjectileVsAsteroid = function (
    proj,
    asteroid,
    player,
    particleSystem,
    audioManager
  ) {
    proj.active = false;

    var damage = proj.damage || 1;
    var wasDead = !asteroid.active || (asteroid.health !== undefined && asteroid.health <= 0);

    if (typeof asteroid.takeDamage === 'function') {
      asteroid.takeDamage(damage);
    } else if (asteroid.health !== undefined) {
      asteroid.health -= damage;
      if (asteroid.health <= 0) {
        asteroid.active = false;
      }
    }

    var isDead = !asteroid.active || (asteroid.health !== undefined && asteroid.health <= 0);

    if (!wasDead && isDead) {
      if (typeof asteroid.fragment === 'function') {
        asteroid.fragment();
      }

      if (player) {
        var scoreValue = asteroid.scoreValue || asteroid.score || 50;
        if (typeof player.addScore === 'function') {
          player.addScore(scoreValue);
        } else if (player.score !== undefined) {
          player.score += scoreValue;
        }
      }

      if (particleSystem && typeof particleSystem.emit === 'function') {
        particleSystem.emit(asteroid.x, asteroid.y, {
          count: 15,
          color: '#aaaaaa',
          size: asteroid.radius || 12,
          spread: 2.5
        });
      }

      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('asteroidDestroy');
      }
    } else {
      if (particleSystem && typeof particleSystem.emitImpact === 'function') {
        particleSystem.emitImpact(proj.x, proj.y, projAngle(proj), Math.min(3, proj.tier || 1), '#cccccc');
      } else if (particleSystem && typeof particleSystem.emit === 'function') {
        particleSystem.emit(proj.x, proj.y, { count: 4, color: '#cccccc', size: 3 });
      }
      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('asteroidHit');
      }
    }

    this.logEvent('proj_vs_asteroid', proj.x, proj.y);
  };

  CollisionManager.prototype.handlePlayerVsEnemy = function (
    player,
    enemy,
    particleSystem,
    audioManager
  ) {
    // Kamikaze enemies (scout / swarm) explode on contact, even if the player is invincible
    if (enemy.dieOnContact && typeof enemy.takeDamage === 'function') {
      enemy.rammed = true;
      enemy.takeDamage(99999);
      if (particleSystem && typeof particleSystem.emitExplosion === 'function') {
        particleSystem.emitExplosion(enemy.x, enemy.y, {
          count: 14,
          color: enemy.explosionColor || '#ff6600',
          size: enemy.radius || 10
        });
      }
      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('enemyExplode');
      }
    }

    if (player.invincible || player.invincibleTimer > 0) return;

    var damage = enemy.damage || enemy.contactDamage || 1;

    if (typeof player.takeDamage === 'function') {
      player.takeDamage(damage);
    } else if (player.health !== undefined) {
      player.health -= damage;
      if (player.health <= 0) {
        player.active = false;
      }
    }

    // Brief knockback
    var dx = player.x - enemy.x;
    var dy = player.y - enemy.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var knockbackForce = 320; // px/s impulse
    if (player.vx !== undefined) player.vx += (dx / len) * knockbackForce;
    if (player.vy !== undefined) player.vy += (dy / len) * knockbackForce;

    if (player.invincibleTimer !== undefined) {
      player.invincibleTimer = player.invincibleDuration || 60;
    }

    if (particleSystem && typeof particleSystem.emit === 'function') {
      particleSystem.emit(player.x, player.y, {
        count: 10,
        color: '#ff0000',
        size: 5,
        spread: 2
      });
    }

    if (audioManager && typeof audioManager.play === 'function') {
      audioManager.play('playerHit');
    }

    this.logEvent('player_vs_enemy', player.x, player.y);
  };

  CollisionManager.prototype.handlePlayerVsAsteroid = function (
    player,
    asteroid,
    particleSystem,
    audioManager
  ) {
    if (player.invincible || player.invincibleTimer > 0) return;

    var damage = asteroid.damage || asteroid.contactDamage || 1;

    if (typeof player.takeDamage === 'function') {
      player.takeDamage(damage);
    } else if (player.health !== undefined) {
      player.health -= damage;
      if (player.health <= 0) {
        player.active = false;
      }
    }

    var dx = player.x - asteroid.x;
    var dy = player.y - asteroid.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var knockbackForce = 240; // px/s impulse
    if (player.vx !== undefined) player.vx += (dx / len) * knockbackForce;
    if (player.vy !== undefined) player.vy += (dy / len) * knockbackForce;

    if (player.invincibleTimer !== undefined) {
      player.invincibleTimer = player.invincibleDuration || 60;
    }

    if (particleSystem && typeof particleSystem.emit === 'function') {
      particleSystem.emit(player.x, player.y, {
        count: 8,
        color: '#ff4400',
        size: 5,
        spread: 2
      });
    }

    if (audioManager && typeof audioManager.play === 'function') {
      audioManager.play('playerHit');
    }

    this.logEvent('player_vs_asteroid', player.x, player.y);
  };

  CollisionManager.prototype.handleEnemyProjectileVsPlayer = function (
    proj,
    player,
    particleSystem,
    audioManager
  ) {
    if (player.invincible || player.invincibleTimer > 0) return;

    proj.active = false;

    var damage = proj.damage || 1;

    if (typeof player.takeDamage === 'function') {
      player.takeDamage(damage);
    } else if (player.health !== undefined) {
      player.health -= damage;
      if (player.health <= 0) {
        player.active = false;
      }
    }

    if (player.invincibleTimer !== undefined) {
      player.invincibleTimer = player.invincibleDuration || 60;
    }

    if (particleSystem && typeof particleSystem.emit === 'function') {
      particleSystem.emit(player.x, player.y, {
        count: 12,
        color: '#ff0044',
        size: 4,
        spread: 2.5
      });
    }

    if (audioManager && typeof audioManager.play === 'function') {
      audioManager.play('playerHit');
    }

    this.logEvent('enemy_proj_vs_player', proj.x, proj.y);
  };

  CollisionManager.prototype.handlePowerUpVsPlayer = function (
    powerup,
    player,
    powerUpEffects,
    audioManager
  ) {
    powerup.active = false;

    var type = powerup.type || 'generic';

    if (powerUpEffects && typeof powerUpEffects[type] === 'function') {
      powerUpEffects[type](player, powerup);
    } else if (typeof player.applyPowerUp === 'function') {
      player.applyPowerUp(type, powerup);
    } else {
      switch (type) {
        case 'health':
        case 'heal':
          var healAmt = powerup.value || 20;
          if (player.health !== undefined) {
            player.health = Math.min(
              player.maxHealth || 100,
              player.health + healAmt
            );
          }
          break;
        case 'shield':
          player.shield = (player.shield || 0) + (powerup.value || 1);
          break;
        case 'rapidFire':
          player.rapidFire = true;
          player.rapidFireTimer = powerup.duration || 300;
          break;
        case 'tripleShot':
          player.tripleShot = true;
          player.tripleShotTimer = powerup.duration || 300;
          break;
        case 'piercing':
          player.piercingShot = true;
          player.piercingShotTimer = powerup.duration || 300;
          break;
        case 'bomb':
        case 'smartBomb':
          if (typeof player.activateBomb === 'function') {
            player.activateBomb();
          }
          break;
        case 'score':
          var scoreAmt = powerup.value || 500;
          if (typeof player.addScore === 'function') {
            player.addScore(scoreAmt);
          } else if (player.score !== undefined) {
            player.score += scoreAmt;
          }
          break;
        default:
          break;
      }
    }

    if (window.particleSystem && typeof window.particleSystem.emitCollect === 'function') {
      window.particleSystem.emitCollect(powerup.x, powerup.y, {
        count: 18,
        color: powerup.color || '#00ffff',
        size: 6,
        spread: 3
      });
    } else if (window.particleSystem && typeof window.particleSystem.emit === 'function') {
      window.particleSystem.emit(powerup.x, powerup.y, {
        count: 18,
        color: powerup.color || '#00ffff',
        size: 6,
        spread: 3
      });
    }

    if (audioManager && typeof audioManager.play === 'function') {
      audioManager.play('powerUp');
    }

    this.logEvent('powerup_collect_' + type, powerup.x, powerup.y);
  };

  CollisionManager.prototype.handlePlayerProjectileVsBoss = function (
    proj,
    boss,
    player,
    particleSystem,
    audioManager
  ) {
    if (!proj.piercing) {
      proj.active = false;
    }

    var damage = proj.damage || 1;
    var previousPhase = boss.phase || 1;
    var previousHealth = boss.health;

    if (typeof boss.takeDamage === 'function') {
      boss.takeDamage(damage);
    } else if (boss.health !== undefined) {
      boss.health -= damage;
      if (boss.health < 0) boss.health = 0;
    }

    var currentPhase = boss.phase || 1;

    if (particleSystem && typeof particleSystem.emit === 'function') {
      particleSystem.emit(proj.x, proj.y, {
        count: 5,
        color: boss.hitColor || '#ff00ff',
        size: 5
      });
    }
    if (particleSystem && typeof particleSystem.emitImpact === 'function') {
      particleSystem.emitImpact(proj.x, proj.y, projAngle(proj), impactTier(proj), tierColor(proj));
    }

    if (audioManager && typeof audioManager.play === 'function') {
      audioManager.play('bossHit');
    }

    // Phase change detection
    if (currentPhase !== previousPhase) {
      if (particleSystem && typeof particleSystem.emitExplosion === 'function') {
        particleSystem.emitExplosion(boss.x, boss.y, {
          count: 40,
          color: '#ff00ff',
          size: boss.radius || 40
        });
      }
      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('bossPhaseChange');
      }
      this.logEvent('boss_phase_change_' + currentPhase, boss.x, boss.y);
    }

    // Boss defeated
    if (boss.health !== undefined && boss.health <= 0 && !boss.defeated) {
      boss.defeated = true;
      boss.active = false;

      if (player) {
        var bossScore = boss.scoreValue || boss.score || 10000;
        if (typeof player.addScore === 'function') {
          player.addScore(bossScore);
        } else if (player.score !== undefined) {
          player.score += bossScore;
        }
      }

      if (particleSystem && typeof particleSystem.emitExplosion === 'function') {
        particleSystem.emitExplosion(boss.x, boss.y, {
          count: 80,
          color: '#ff6600',
          size: (boss.radius || 60) * 2
        });
      }

      if (audioManager && typeof audioManager.play === 'function') {
        audioManager.play('bossExplode');
      }

      this.logEvent('boss_defeated', boss.x, boss.y);
    } else {
      this.logEvent('proj_vs_boss', proj.x, proj.y);
    }
  };

  CollisionManager.prototype.logEvent = function (type, x, y) {
    // Feed the ENGINE INSIGHT panel with real collision events
    if (window.DebugManager && typeof window.DebugManager.addCollisionEvent === 'function') {
      window.DebugManager.addCollisionEvent({
        type: type,
        detail: '@(' + Math.round(x || 0) + ',' + Math.round(y || 0) + ')'
      });
    }
    this.collisionEvents.push({
      type: type,
      x: x || 0,
      y: y || 0,
      timestamp: Date.now()
    });
    if (this.collisionEvents.length > 20) {
      this.collisionEvents.shift();
    }
  };

  window.CollisionManager = CollisionManager;

}(window));
