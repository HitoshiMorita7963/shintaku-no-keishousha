// エントリポイント。生成済みバンドル（game/generated/data.bundle.js）からデータを読み込む。
import { GameData } from './data/gameData.js';
import { App } from './ui/app.js';
import { titleScreen } from './ui/screens/title.js';

function boot() {
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  const bundle = /** @type {any} */ (window).SHINKAN_DATA;
  if (!bundle) {
    root.innerHTML = '<div class="screen center"><div class="window error-window"><h2>データが読み込めません</h2>' +
      '<p><code>npm run build:data</code> を実行して game/generated/data.bundle.js を生成してください。</p></div></div>';
    return;
  }
  /** @type {App | null} */ let app = null;
  try {
    const data = new GameData(bundle);
    app = new App(root, data, bundle.meta);
    /** @type {any} */ (window).__app = app; // デバッグ用
    app.go(titleScreen);
  } catch (e) {
    if (app) app.fatal(e);
    else {
      const err = /** @type {Error} */ (e);
      root.textContent = `初期化エラー: ${err.message}`;
      console.error(e);
    }
  }
}

boot();
