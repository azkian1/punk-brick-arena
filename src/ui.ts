import type { CharacterTemplate, EvolutionId } from './game/types';
import { EVOLUTIONS, EVOLUTION_THRESHOLD, type evolutionProgress } from './game/evolution';
import { CONFIG } from './game/config';
import { characterPortrait as portrait } from './assets/catalog';
import { assetUrl } from './assets/url';
import { BOT_LABELS, BOT_DIFFICULTIES, type BotStyle, type BotDifficulty } from './game/bots';

type Screen = 'lobby' | 'playing' | 'collecting' | 'paused' | 'result';
type Callbacks = {
  onStart: (templateId: string) => void;
  onRestart: () => void;
  onNextRound: () => void;
  onLobby: () => void;
  onPause: () => void;
  onMute: () => void;
  onSelect: (templateId: string) => void;
  onDamageChange: (value: number) => void;
  onEvolution: (id: EvolutionId) => void;
  onMove: (x: number, z: number) => void;
};
type UpdateData = {
  elapsed: number;
  playerPieces: number;
  enemyPieces: number;
  repairs: number;
  growth: number;
  shots: number;
  hits: number;
  muted: boolean;
  damage: number;
  round: number;
  playerCoreExposed: boolean;
  enemyCoreExposed: boolean;
  playerCoreThreshold: number;
  enemyCoreThreshold: number;
  dashCooldown: number;
  dashing: boolean;
  botStyle: BotStyle;
  botDifficulty: BotDifficulty;
  botPanic: boolean;
  victoryCollected: number;
  victoryTotal: number;
  evolution: ReturnType<typeof evolutionProgress>;
  enemyReserve: number;
};
type ResultStats = { elapsed: number; repairs: number; growth: number; hits: number; direct: number; cascade: number; round: number; carriedPieces: number; basePieces: number; victoryCollected: number; victorySkipped: number; reserve: number; evolutionName: string; evolved: boolean };

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const icon = (name: 'arrow' | 'sound' | 'muted' | 'pause' | 'play' | 'reset' | 'backpack') => {
  const paths = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    backpack: '<path d="M8 6V4h8v2M7 7h10l2 4v10H5V11l2-4Z"/><path d="M8 14h8v5H8zM9 10h6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

const ROSTER_PAGE_SIZE = 6;
const pieceWord = (count: number) => count === 1 ? 'piece' : 'pieces';

function reservePanel(side: 'player' | 'enemy') {
  const player = side === 'player';
  return `<aside class="reserve-panel reserve-panel--${side}" data-section="hud" aria-label="${player ? 'Your backpack' : 'Opponent backpack'}" hidden>
    <header class="reserve-panel__header"><div class="reserve-panel__heading"><span class="reserve-panel__icon">${icon('backpack')}</span><div><h2>${player ? 'Backpack' : 'Rival stock'}</h2><span>${player ? 'YOUR SPARE PARTS' : 'OPPONENT’S SPARES'}</span></div></div><div class="reserve-panel__count"><strong ${player ? 'data-reserve' : 'data-enemy-reserve'}>0</strong><span data-reserve-unit="${side}">pieces saved</span><span class="reserve-panel__auto" title="Spare parts are used automatically">AUTO</span></div></header>
    <div class="reserve-panel__stage" data-reserve-stage="${side}" aria-hidden="true"><div class="reserve-panel__empty" data-reserve-empty="${side}"><strong>Ready for loot</strong><span>Spare parts collect here</span></div></div>
    <footer class="reserve-panel__footer"><span class="reserve-panel__dot" aria-hidden="true"></span><span data-reserve-note="${side}">${player ? 'Saved for repairs & growth' : 'Saved for the next build'}</span></footer>
  </aside>`;
}

function tuning(): string {
  return `<details class="tuning"><summary>Match Settings<span aria-hidden="true">+</span></summary><div class="tuning__body"><label>Pieces removed per hit <output data-damage-output>${CONFIG.projectilePower}</output><input data-damage type="range" min="1" max="20" step="1" value="${CONFIG.projectilePower}" aria-label="Pieces removed per hit" /></label><p>Applies to both fighters. Cascades can knock off extra pieces. Reclaim your own pieces after ${CONFIG.ownPickupDelay} seconds.</p></div></details>`;
}

export class GameUI {
  private readonly element: HTMLDivElement;
  private readonly callbacks: Callbacks;
  private readonly templates: CharacterTemplate[];
  private selected: string;
  private rosterPage = 0;
  private screen: Screen = 'lobby';
  private damage: number = CONFIG.projectilePower;
  private joystickPointer: number | null = null;

  constructor(private readonly root: HTMLElement, templates: CharacterTemplate[], callbacks: Callbacks) {
    this.callbacks = callbacks;
    this.templates = templates;
    this.selected = templates[0]?.id ?? '';
    this.element = document.createElement('div');
    this.element.className = 'game-ui';
    this.element.dataset.screen = 'lobby';
    this.element.innerHTML = `
      <header class="topbar">
        <div class="brand" aria-label="Punk Brick Arena"><span class="brand__mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Punk Brick<span class="brand__second">Arena</span></span></div>
        <nav class="site-nav" aria-label="Page navigation"><a href="#play">Play</a><a href="#how-to-play">How to Play</a><a href="#about">About</a></nav>
        <span class="mode-label"><span class="live-dot"></span>ONE ON ONE · VS. BOT</span>
        <div class="topbar__actions"><span class="build-label">FAN MADE <span>01</span></span><button class="icon-button" data-action="mute" aria-label="Mute sound" title="Sound · M">${icon('sound')}</button><button class="icon-button" data-action="pause" aria-label="Pause" title="Pause · P / Esc" hidden>${icon('pause')}</button></div>
      </header>

      <div class="community-page" data-section="lobby">
        <section class="play-section" id="play" aria-label="Character selection">
          <div class="hero-copy">
            <p class="section-kicker"><span class="pixel-dot" aria-hidden="true"></span> A COMMUNITY PLAYGROUND</p>
            <h1>Pixels.<br>Bricks.<br><em>Play.</em></h1>
            <p class="hero-description">Familiar punks. A whole new form. Battle a bot, collect the pieces, and build your next self.</p>
            <div class="roster-label"><span>01 / PICK YOUR PUNK</span><span>${templates.length} PUNKS</span></div>
            <div class="character-roster" role="group" aria-label="Characters">${templates.map((template, index) => `
              <button class="character-card${index === 0 ? ' is-selected' : ''}" data-character="${escape(template.id)}" aria-pressed="${index === 0}"${index >= ROSTER_PAGE_SIZE ? ' hidden' : ''}>
                <span class="character-card__image"><img src="${portrait(template.id)}" alt="" width="24" height="24" /></span>
                <span class="character-card__info"><span class="character-card__name">${escape(template.name)}</span><span class="character-card__pieces">${template.pieces.length} pieces</span></span>
                <span class="character-card__check" aria-hidden="true">✓</span>
              </button>`).join('')}</div>
            <div class="roster-pagination" aria-label="Character pages"${templates.length <= ROSTER_PAGE_SIZE ? ' hidden' : ''}>
              <button data-action="roster-prev" aria-label="Previous characters" disabled>←</button>
              <span data-roster-page aria-live="polite">1–${Math.min(ROSTER_PAGE_SIZE, templates.length)} of ${templates.length}</span>
              <button data-action="roster-next" aria-label="Next characters">→</button>
            </div>
            <div class="evolution-select">
              <div class="roster-label"><span>02 / CHOOSE YOUR EVOLUTION</span><span>ONE PATH PER RUN</span></div>
              <div class="evolution-options" role="group" aria-label="Evolution path">${EVOLUTIONS.map((e, i) => `<button data-evolution="${escape(e.id)}" aria-pressed="${i === 0}" class="evolution-option${i === 0 ? ' is-selected' : ''}">${escape(e.name)}</button>`).join('')}</div>
              <p data-evolution-description>${escape(EVOLUTIONS[0].description)}</p>
              <small>Head → Body Form → Final Form. Spare parts wait in your reserve.</small>
            </div>
            <button class="primary-button play-button" data-action="start"><span>Play vs. Bot</span>${icon('arrow')}</button>
            <p class="play-caption">Free to play · In your browser · Keyboard, mouse, or touch</p>
            <p class="touch-note">In a match, use the left joystick to move and touch the arena to aim and fire.</p>
            ${tuning()}
          </div>
          <div class="punk-preview" aria-label="Selected punk preview">
            <div class="preview-toolbar"><span><span class="pixel-dot" aria-hidden="true"></span> BRICK VIEW</span><span>LIVE 3D</span></div>
            <div class="preview-stage" data-preview-stage></div>
            <div class="pixel-origin"><img data-selected-portrait src="${portrait(this.selected)}" alt="Original pixel portrait" width="24" height="24" /><span>PIXEL<br>TO BRICK</span><span aria-hidden="true">↗</span></div>
            <div class="preview-caption"><div><span class="section-kicker">YOUR STARTING BUILD</span><strong data-selected-name>${escape(templates[0]?.name ?? '')}</strong><span data-selected-subtitle>${escape(templates[0]?.subtitle ?? '')}</span></div><div class="piece-count"><strong data-selected-pieces>${templates[0]?.pieces.length ?? 0}</strong><span>PIECES</span></div></div>
          </div>
        </section>

        <div class="community-strip"><span>MORE PIECES.<br><strong>MORE POSSIBILITIES.</strong></span><div class="pixel-lineup" aria-hidden="true">${templates.slice(0, 3).map(template => `<img src="${portrait(template.id)}" alt="" width="24" height="24" />`).join('')}</div><span>MADE FOR THE LOVE OF PUNKS.<br><strong>JUST FOR FUN.</strong></span></div>

        <section class="how-section" id="how-to-play" aria-labelledby="how-title">
          <div class="section-heading"><p class="section-kicker">02 / HOW TO PLAY</p><h2 id="how-title">Easy to learn.<br>Hard to stay in one piece.</h2></div>
          <div class="rules-grid">
            <article><span class="step-number">01</span><h3>Break them apart</h3><p>Move, aim, and shoot. Press Space to dash. Face an easy Balanced bot first, then a medium one. From round 3, face any of the four bot styles at full strength.</p><div class="rule-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>+ mouse</span></div></article>
            <article><span class="step-number">02</span><h3>Build your punk</h3><p>Choose an evolution. Loot repairs missing pieces, then builds its body from the head down. Parts that do not fit wait in the side reserve and carry into the next round. Reclaim your own pieces after ${CONFIG.ownPickupDelay} seconds.</p><span class="rule-tag">REPAIR → BUILD → SAVE SPARES</span></article>
            <article><span class="step-number">03</span><h3>Protect your Core</h3><p>Lose ${Math.round(CONFIG.coreProtectionLoss * 100)}% of your starting pieces and your Core stays exposed for the rest of the round. Destroy the enemy Core to win, then collect the remaining debris.</p><span class="rule-tag">WIN → COLLECT → NEXT ROUND</span></article>
          </div>
          <div class="keyboard-guide"><span><kbd>Space</kbd> Dash · ${CONFIG.dashCooldown} s</span><span><kbd>P</kbd> / <kbd>Esc</kbd> Pause</span><span><kbd>R</kbd> Start Over</span><span><kbd>M</kbd> Sound</span><span>Win to carry your build into the next round.</span></div>
        </section>

        <section class="about-section" id="about" aria-labelledby="about-title">
          <div>
            <p class="section-kicker">03 / FROM THE COMMUNITY, FOR THE COMMUNITY</p>
            <h2 id="about-title">Remix culture.<br><em>Now playable.</em></h2>
            <p>Punk Brick Arena is an independent fan project inspired by CryptoPunks and a love of NFT culture. It is noncommercial and has no financial motive.</p>
            <p>Created by <a href="https://x.com/azaticus" target="_blank" rel="noopener noreferrer">@azaticus · Twitter / X ↗</a>.</p>
            <p>Characters are built using the open-source <a href="https://github.com/hs7j4yk4sz-boop/punk-to-bricks" target="_blank" rel="noopener noreferrer">Punk to Bricks</a> generator by <a href="https://x.com/johnkarp" target="_blank" rel="noopener noreferrer">John Karp (@johnkarp)</a>. Thank you for making it possible to turn pixel punks into brick builds.</p>
            <p>Explore the code, make changes, and fork the game. Credit to Punk Brick Arena and a link to the original project are appreciated. Third-party code and assets remain subject to their own terms.</p>
          </div>
          <div class="credits-list">
            <a href="https://cryptopunks.app/" target="_blank" rel="noopener noreferrer"><span class="credit-number">01</span><span><strong>CryptoPunks</strong><small>Original punks · our inspiration</small></span><span aria-hidden="true">↗</span></a>
            <a href="https://hs7j4yk4sz-boop.github.io/punk-to-bricks/" target="_blank" rel="noopener noreferrer"><span class="credit-number">02</span><span><strong>Punk to Bricks</strong><small>Brick generator · John Karp</small></span><span aria-hidden="true">↗</span></a>
            <p class="project-disclaimer">Punk Brick Arena is not affiliated with, sponsored by, or endorsed by CryptoPunks or LEGO. Use of the generator does not imply its author's involvement or endorsement. Third-party code, images, and trademarks belong to their respective owners.</p>
            <a class="credits-notices" href="${assetUrl('ATTRIBUTION.txt')}" target="_blank" rel="noopener noreferrer">Third-party credits and licenses ↗</a>
          </div>
        </section>
        <footer class="site-footer"><span>Punk Brick Arena <span class="footer-dot">■</span> FAN MADE, FOR FUN.</span><a href="https://x.com/azaticus" target="_blank" rel="noopener noreferrer">Twitter / X · @azaticus ↗</a><a href="#play">Back to Play ↑</a></footer>
      </div>

      <section class="match-hud" data-section="hud" aria-label="Match status" hidden>
        <div class="fighter fighter--you"><span class="fighter__marker"></span><div><span class="fighter__label">YOUR BUILD</span><strong><span data-player-pieces>0</span><small data-player-piece-label>pieces</small></strong><span class="core-status" data-player-core>Core protected</span></div><span class="fighter__core" title="Protect your Core"><span class="core-diamond"></span></span></div>
        <div class="match-clock" aria-label="Round and match time"><span class="match-clock__round">ROUND <b data-round>1</b></span><strong data-clock>00:00</strong></div>
        <div class="fighter fighter--enemy"><span class="fighter__marker"></span><div><span class="fighter__label" data-bot-style>OPPONENT · BOT</span><strong><span data-enemy-pieces>0</span><small data-enemy-piece-label>pieces</small></strong><span class="core-status" data-enemy-core>Core protected</span></div></div>
      </section>

      ${reservePanel('player')}${reservePanel('enemy')}
      <div class="collection-hud" data-section="hud" hidden><span class="collection-hud__icon" aria-hidden="true">+</span><div><span class="collection-hud__title" data-evolution-title>YOUR EVOLUTION</span><span class="collection-hud__values"><b data-repairs>0</b> repaired <span>·</span> <b data-growth>0</b> added</span><span class="evolution-status" data-evolution-status></span><progress data-evolution-progress max="1" value="0" aria-label="Body assembly"></progress></div></div>
      <div class="dash-hud" data-section="hud" hidden><kbd>SPACE</kbd><div><strong>DASH</strong><span data-dash-status>Ready</span></div><progress data-dash-progress max="1" value="1" aria-label="Dash readiness"></progress></div>
      <div class="victory-collection" data-section="collecting" role="status" hidden><span class="section-kicker">VICTORY!</span><strong>Assembling your next form</strong><span><b data-victory-collected>0</b> / <b data-victory-total>0</b> <span data-victory-piece-label>pieces</span></span><progress data-victory-progress max="1" value="0" aria-label="Victory collection"></progress><small>Loot + reserve. Repair, build, save the rest.</small></div>

      <div class="mobile-joystick" data-section="hud" role="group" aria-label="Movement joystick" hidden>
        <div class="mobile-joystick__base" data-joystick><span class="mobile-joystick__knob" data-joystick-knob></span></div>
        <span class="mobile-joystick__label">MOVE</span>
      </div>
      <footer class="controls-bar" data-section="hud" hidden><div class="control-hint"><span class="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>move</span></div><span class="control-divider"></span><div class="control-hint"><span class="mouse-icon" aria-hidden="true"></span><span>aim & fire</span></div><div class="control-hint control-hint--extra"><kbd>P</kbd><span>pause</span><kbd>R</kbd><span>restart</span></div><span class="controls-bar__note">MOVE NEAR PIECES TO COLLECT THEM</span></footer>

      <div class="modal-backdrop" data-section="paused" hidden><section class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="modal-brick" aria-hidden="true">Ⅱ</div><span class="eyebrow">TAKE YOUR TIME</span><h2 id="pause-title">Take a<br>build break.</h2><p>Your build can wait. So can your opponent.</p><button class="primary-button" data-action="resume"><span>Resume</span>${icon('play')}</button><button class="secondary-button" data-action="restart">${icon('reset')}Start Over</button><button class="secondary-button" data-action="lobby">Choose Character</button>${tuning()}</section></div>

      <div class="modal-backdrop" data-section="result" hidden><section class="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div class="result-badge" data-result-badge>VICTORY</div><h2 id="result-title">You Win!</h2>
        <p data-result-description>Enemy Core destroyed. Your build keeps growing.</p>
        <div class="result-survivor" data-result-survivor><span>YOUR BUILD</span><strong><b data-carried-pieces>0</b> <small data-carried-piece-label>pieces</small></strong><span data-size-ratio></span></div>
        <div class="result-stats"><div><strong data-result-repairs>0</strong><span>REPAIRED</span></div><div><strong data-result-growth>0</strong><span>ADDED</span></div><div><strong data-result-direct>0</strong><span title="Enemy pieces removed by your shots">SHOT OFF</span></div><div><strong data-result-cascade>0</strong><span title="Enemy pieces detached in cascades">BROKE LOOSE</span></div></div>
        <div class="result-caption"><span>TIME <b data-result-time>00:00</b></span><span>HITS <b data-result-hits>0</b></span></div>
        <p class="victory-bonus" data-victory-bonus></p>
        <button class="primary-button round-action" data-action="next"><span><strong>Next Round</strong><small data-next-round-note>Keep your build · next round</small></span>${icon('arrow')}</button>
        <button class="secondary-button round-action round-action--new" data-action="restart"><span><strong>Start Over</strong><small>Back to base form · round 1</small></span>${icon('reset')}</button>
        <button class="secondary-button" data-action="lobby">Choose Character</button>
        <p class="result-footnote" data-result-footnote>Only attached pieces carry into the next round.</p>
      </section></div>

      <div class="toast-stack" aria-live="polite" aria-atomic="false"></div>
    `;
    root.append(this.element);
    this.setupJoystick();
    this.element.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!target) return;
      if (target.dataset.evolution) {
        const evolution = EVOLUTIONS.find(e => e.id === target.dataset.evolution);
        if (!evolution) return;
        this.element.querySelectorAll<HTMLButtonElement>('[data-evolution]').forEach(button => {
          const selected = button.dataset.evolution === evolution.id;
          button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
        });
        this.setText('[data-evolution-description]', evolution.description);
        this.callbacks.onEvolution(evolution.id);
        return;
      }
      if (target.dataset.character) {
        this.select(target.dataset.character);
        return;
      }
      switch (target.dataset.action) {
        case 'roster-prev': this.showRosterPage(this.rosterPage - 1); break;
        case 'roster-next': this.showRosterPage(this.rosterPage + 1); break;
        case 'start': this.callbacks.onStart(this.selected); break;
        case 'restart': this.callbacks.onRestart(); break;
        case 'next': this.callbacks.onNextRound(); break;
        case 'lobby': this.callbacks.onLobby(); break;
        case 'pause':
        case 'resume': this.callbacks.onPause(); break;
        case 'mute': this.callbacks.onMute(); break;
      }
    });
    this.element.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      if (!target.matches('[data-damage]')) return;
      this.damage = Math.max(1, Math.min(20, Math.round(Number(target.value))));
      this.syncDamage();
      this.callbacks.onDamageChange(this.damage);
    });
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || (this.screen !== 'paused' && this.screen !== 'result')) return;
      const dialog = this.element.querySelector<HTMLElement>(`[data-section="${this.screen}"] .modal`)!;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, summary')].filter((control) => control.getClientRects().length > 0 && !control.matches(':disabled'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
  }

  private setupJoystick(): void {
    const base = this.element.querySelector<HTMLElement>('[data-joystick]')!;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = base.getBoundingClientRect();
      const knob = this.element.querySelector<HTMLElement>('[data-joystick-knob]')!;
      const radius = Math.max(1, (Math.min(bounds.width, bounds.height) - knob.offsetWidth) / 2);
      const rawX = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
      const rawZ = (event.clientY - (bounds.top + bounds.height / 2)) / radius;
      const length = Math.hypot(rawX, rawZ);
      const scale = length > 1 ? 1 / length : 1;
      const x = rawX * scale, z = rawZ * scale;
      knob.style.transform = `translate(${x * radius}px, ${z * radius}px)`;
      const deadZone = 0.12;
      const magnitude = Math.min(1, length);
      if (magnitude <= deadZone) this.callbacks.onMove(0, 0);
      else {
        const adjusted = (magnitude - deadZone) / (1 - deadZone);
        this.callbacks.onMove(x / Math.max(magnitude, 0.001) * adjusted, z / Math.max(magnitude, 0.001) * adjusted);
      }
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      this.resetJoystick();
    };
    base.addEventListener('pointerdown', (event) => {
      if (this.screen !== 'playing' || this.joystickPointer !== null) return;
      event.preventDefault();
      event.stopPropagation();
      this.joystickPointer = event.pointerId;
      base.setPointerCapture(event.pointerId);
      base.classList.add('is-active');
      move(event);
    });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    base.addEventListener('lostpointercapture', release);
  }

  private resetJoystick(): void {
    this.joystickPointer = null;
    const base = this.element.querySelector<HTMLElement>('[data-joystick]');
    const knob = this.element.querySelector<HTMLElement>('[data-joystick-knob]');
    base?.classList.remove('is-active');
    if (knob) knob.style.transform = '';
    this.callbacks.onMove(0, 0);
  }

  private showRosterPage(page: number): void {
    const lastPage = Math.ceil(this.templates.length / ROSTER_PAGE_SIZE) - 1;
    this.rosterPage = Math.max(0, Math.min(lastPage, page));
    const start = this.rosterPage * ROSTER_PAGE_SIZE;
    this.element.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((card, index) => {
      card.hidden = index < start || index >= start + ROSTER_PAGE_SIZE;
    });
    this.setText('[data-roster-page]', `${start + 1}–${Math.min(start + ROSTER_PAGE_SIZE, this.templates.length)} of ${this.templates.length}`);
    this.element.querySelector<HTMLButtonElement>('[data-action="roster-prev"]')!.disabled = this.rosterPage === 0;
    this.element.querySelector<HTMLButtonElement>('[data-action="roster-next"]')!.disabled = this.rosterPage === lastPage;
  }

  private select(id: string): void {
    const template = this.templates.find((candidate) => candidate.id === id);
    if (!template) return;
    this.selected = id;
    this.element.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((card) => {
      const selected = card.dataset.character === id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    this.setText('[data-selected-name]', template.name);
    this.setText('[data-selected-subtitle]', template.subtitle);
    this.setText('[data-selected-pieces]', template.pieces.length);
    this.element.querySelector<HTMLImageElement>('[data-selected-portrait]')!.src = portrait(id);
    this.callbacks.onSelect(id);
  }

  setScreen(screen: Screen): void {
    const changed = this.screen !== screen;
    this.screen = screen;
    this.element.dataset.screen = screen;
    const canvas = this.root.querySelector<HTMLCanvasElement>('#arena')!;
    const host = screen === 'lobby' ? this.element.querySelector<HTMLElement>('[data-preview-stage]')! : this.root;
    if (canvas.parentElement !== host) host.prepend(canvas);
    canvas.tabIndex = screen === 'lobby' ? -1 : 0;
    canvas.setAttribute('aria-label', screen === 'lobby' ? '3D preview of your selected punk' : 'Game arena: use WASD, arrow keys, or the touch joystick to move; aim and fire with the mouse or by touching the arena; Space to dash');
    if (screen !== 'playing') this.resetJoystick();
    if (changed && screen === 'lobby') this.element.scrollTop = 0;
    this.element.querySelector<HTMLElement>('.topbar')!.inert = screen === 'paused' || screen === 'result';
    this.element.querySelectorAll<HTMLElement>('[data-section]').forEach((section) => {
      const name = section.dataset.section;
      section.hidden = name === 'preview' ? screen !== 'lobby' : name === 'hud' ? screen === 'lobby' : name !== screen;
    });
    const pauseButton = this.element.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
    pauseButton.hidden = screen === 'lobby' || screen === 'result';
    pauseButton.innerHTML = icon(screen === 'paused' ? 'play' : 'pause');
    pauseButton.setAttribute('aria-label', screen === 'paused' ? 'Resume game' : 'Pause');
    if (screen === 'paused' || screen === 'result') {
      requestAnimationFrame(() => [...this.element.querySelectorAll<HTMLButtonElement>(`[data-section="${screen}"] .primary-button`)]
        .find(button => !button.hidden && !button.disabled)?.focus({ preventScroll: true }));
    } else if (changed && document.activeElement instanceof HTMLElement && this.element.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  reserveStage(side: 'player' | 'enemy'): HTMLElement {
    return this.element.querySelector<HTMLElement>(`[data-reserve-stage="${side}"]`)!;
  }

  update(data: UpdateData): void {
    this.setText('[data-player-pieces]', data.playerPieces);
    this.setText('[data-enemy-pieces]', data.enemyPieces);
    this.setText('[data-player-piece-label]', pieceWord(data.playerPieces));
    this.setText('[data-enemy-piece-label]', pieceWord(data.enemyPieces));
    this.setText('[data-repairs]', data.repairs);
    this.setText('[data-growth]', data.growth);
    const e = data.evolution;
    this.setText('[data-evolution-title]', e ? `${e.name.toUpperCase()} · ${e.stage === 2 ? 'BODY FORM' : 'FINAL FORM'}` : 'YOUR EVOLUTION');
    this.setText('[data-evolution-status]', e ? `${e.built} / ${e.target} body pieces · ${Math.floor(e.fraction * 100)}%` : '');
    const progress = this.element.querySelector<HTMLProgressElement>('[data-evolution-progress]')!;
    progress.value = e?.fraction ?? 0;
    progress.title = e?.stage === 2 ? `Complete ${EVOLUTION_THRESHOLD * 100}% of Body Form, then win to unlock Final Form` : 'Build and repair Final Form';
    this.setText('[data-reserve]', e?.reserve ?? 0);
    this.setText('[data-enemy-reserve]', data.enemyReserve);
    for (const [side, count] of [['player', e?.reserve ?? 0], ['enemy', data.enemyReserve]] as const) {
      this.setText(`[data-reserve-unit="${side}"]`, `${pieceWord(count)} saved`);
      this.element.querySelector<HTMLElement>(`[data-reserve-empty="${side}"]`)!.hidden = count > 0;
      this.setText(`[data-reserve-note="${side}"]`, count > 240 ? `Showing 240 of ${count} saved pieces` : side === 'player' ? 'Saved for repairs & growth' : 'Saved for the next build');
    }
    this.setText('[data-clock]', time(data.elapsed));
    this.setText('[data-round]', data.round);
    const difficultyLabel = data.botDifficulty === 'normal' ? '' : ` · ${BOT_DIFFICULTIES[data.botDifficulty].name.toUpperCase()}`;
    this.setText('[data-bot-style]', `${BOT_LABELS[data.botStyle].name.toUpperCase()}${difficultyLabel}${data.botPanic ? ' · RAPID FIRE' : ''}`);
    this.element.querySelector<HTMLElement>('[data-bot-style]')!.title = `${BOT_LABELS[data.botStyle].description} ${BOT_DIFFICULTIES[data.botDifficulty].name}.`;
    this.element.querySelector<HTMLElement>('[data-bot-style]')!.classList.toggle('is-panic', data.botPanic);
    this.setText('[data-dash-status]', data.dashing ? 'Dashing!' : data.dashCooldown > 0 ? `${data.dashCooldown.toFixed(1)} s` : 'Ready');
    this.element.querySelector<HTMLProgressElement>('[data-dash-progress]')!.value = 1 - data.dashCooldown / CONFIG.dashCooldown;
    this.element.querySelector<HTMLElement>('.dash-hud')!.classList.toggle('is-ready', data.dashCooldown <= 0);
    this.setText('[data-victory-collected]', data.victoryCollected);
    this.setText('[data-victory-total]', data.victoryTotal);
    this.setText('[data-victory-piece-label]', pieceWord(data.victoryTotal));
    this.element.querySelector<HTMLProgressElement>('[data-victory-progress]')!.value = data.victoryTotal ? data.victoryCollected / data.victoryTotal : 1;
    for (const [selector, exposed, count, threshold] of [
      ['[data-player-core]', data.playerCoreExposed, data.playerPieces, data.playerCoreThreshold],
      ['[data-enemy-core]', data.enemyCoreExposed, data.enemyPieces, data.enemyCoreThreshold],
    ] as const) {
      const status = this.element.querySelector<HTMLElement>(selector)!;
      this.setText(selector, count === 0 ? 'Core destroyed' : exposed ? 'Core exposed!' : 'Core protected');
      status.classList.toggle('is-exposed', exposed);
      status.title = exposed ? 'This Core stays exposed for the rest of this round' : `Core protection ends at ${threshold} ${pieceWord(threshold)} or fewer`;
    }
    if (this.damage !== data.damage) {
      this.damage = data.damage;
      this.syncDamage();
    }
    this.setMuted(data.muted);
  }

  showResult(won: boolean, stats: ResultStats): void {
    this.element.classList.toggle('is-win', won);
    this.setText('[data-result-badge]', `ROUND ${stats.round} · ${won ? 'VICTORY' : 'DEFEAT'}`);
    this.setText('#result-title', won ? 'You Win!' : 'Ready to rebuild?');
    this.setText('[data-result-description]', won ? 'Enemy Core destroyed. Loot collected. Your build is ready for the next round.' : 'Your Core was destroyed. Start a new run with your base build.');
    this.element.querySelector<HTMLElement>('[data-victory-bonus]')!.hidden = !won;
    this.setText('[data-victory-bonus]', `Victory loot: +${stats.victoryCollected} ${pieceWord(stats.victoryCollected)}${stats.victorySkipped ? ` · ${stats.victorySkipped} left behind` : ''}`);
    this.element.querySelector<HTMLElement>('[data-result-survivor]')!.hidden = !won;
    this.setText('[data-carried-pieces]', stats.carriedPieces);
    this.setText('[data-carried-piece-label]', pieceWord(stats.carriedPieces));
    this.setText('[data-size-ratio]', `${stats.evolutionName} · ${stats.reserve} in reserve${stats.evolved ? ' · FINAL FORM UNLOCKED!' : ''}`);
    this.setText('[data-next-round-note]', `Keep your build + reserve · round ${stats.round + 1}`);
    const next = this.element.querySelector<HTMLButtonElement>('[data-action="next"]')!;
    next.hidden = !won;
    next.disabled = !won;
    const restart = this.element.querySelector<HTMLButtonElement>('[data-section="result"] [data-action="restart"]')!;
    restart.classList.toggle('primary-button', !won);
    restart.classList.toggle('secondary-button', won);
    this.setText('[data-result-footnote]', won ? 'Your build, damage, and reserve carry over. The next opponent starts with a base head.' : 'Start Over resets your body and reserve.');
    this.setText('[data-result-repairs]', stats.repairs);
    this.setText('[data-result-growth]', stats.growth);
    this.setText('[data-result-direct]', stats.direct);
    this.setText('[data-result-cascade]', stats.cascade);
    this.setText('[data-result-time]', time(stats.elapsed));
    this.setText('[data-result-hits]', stats.hits);
    this.setScreen('result');
  }

  toast(message: string, kind: 'hit' | 'repair' | 'growth' = 'hit'): void {
    if (this.screen !== 'playing') return;
    const stack = this.element.querySelector('.toast-stack')!;
    while (stack.children.length >= 3) stack.firstElementChild?.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    const mark = document.createElement('span');
    mark.className = 'toast__mark';
    mark.textContent = kind === 'hit' ? '↗' : '+';
    toast.append(mark, document.createTextNode(message));
    stack.append(toast);
    window.setTimeout(() => toast.remove(), 2100);
  }

  setMuted(muted: boolean): void {
    const button = this.element.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
    if (button.dataset.muted === String(muted)) return;
    button.dataset.muted = String(muted);
    button.innerHTML = icon(muted ? 'muted' : 'sound');
    button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(muted));
  }

  private syncDamage(): void {
    this.element.querySelectorAll<HTMLInputElement>('[data-damage]').forEach((input) => { input.value = String(this.damage); });
    this.element.querySelectorAll<HTMLOutputElement>('[data-damage-output]').forEach((output) => { output.value = String(this.damage); });
  }

  private setText(selector: string, value: string | number): void {
    const element = this.element.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== String(value)) element.textContent = String(value);
  }
}
