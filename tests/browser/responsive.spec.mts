import { test, expect, type Page } from '@playwright/test';

const widths = [320, 375, 430, 768, 1024, 1280, 1440, 1920, 2560, 3440];
const views = ['login', 'signup', 'home', 'profile', 'history', 'pix', 'currencies', 'investments', 'transfer', 'stocks', 'holdings', 'error'];
const now = '2026-11-25T14:30:00Z';

test.beforeEach(async ({ page }) => {
  // No production authentication, requests or transactions during layout tests.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:') return route.continue();
    if (route.request().method() !== 'GET') return route.abort();
    let body: unknown = { mensagens: [] };
    if (url.pathname.endsWith('/investimentos/resultado')) body = {
      investido: '88.00', valor_atual: '88.86', resultado: '0.86', percentual: '0.98',
      saldo_disponivel: '4289.41', patrimonio_atual: '4378.27', cotacao_em: now, consultado_em: now, ativos_sem_cotacao: [],
    };
    else if (url.pathname.includes('yahoo-historico')) body = {
      codigo: 'PETR4', periodo: url.searchParams.get('periodo'), intervalo: '1d', fonte: 'yahoo', consultado_em: now,
      pontos: Array.from({ length: 20 }, (_, i) => ({ data: `2026-11-${String(i + 1).padStart(2, '0')}`, preco_brl: (40 + Math.sin(i) * 5).toFixed(2) })),
    };
    else if (url.pathname.endsWith('/ativos')) body = { pagina: 1, tem_proxima: true, ativos: Array.from({ length: 8 }, (_, i) => ({
      codigo: i === 0 ? 'PETR4' : `ATIVO${i}`, tipo: i % 2 ? 'FII' : 'ACAO',
      nome: 'Companhia Brasileira de Investimentos e Participações de Nome Comprido',
    })) };
    else if (url.pathname.includes('/ativos/')) body = {
      codigo: 'PETR4', nome: 'Petróleo Brasileiro Sociedade Anônima Preferencial', tipo: 'ACAO',
      preco_brl: '44.43', cotacao_em: now, consultado_em: now, fonte: 'brapi',
    };
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
});

async function open(page: Page, view: string, theme = 'light', extra = '') {
  await page.goto(`/tests/browser/fixture.html?view=${view}&theme=${theme}${extra}`);
  await expect(page.locator('.login-shell, .account-app')).toBeVisible();
  if (view === 'login' || view === 'signup') {
    await expect(page.locator('.login-form-panel form + p')).toHaveCSS('opacity', '1');
  }
  if (view === 'stocks') {
    await page.locator('#market-search').fill('PETR');
    await page.locator('.market-results button').first().click();
    await expect(page.locator('.market-history-chart svg')).toBeVisible();
  }
}

async function assertLayout(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const roots = [...document.querySelectorAll<HTMLElement>([
      '.login-shell', '.login-form-panel', '.login-brand-nav', '.account-topbar-inner', '.account-user',
      '.account-overview', '.account-detail', '.investment-portfolio', '.investment-result', '.investment-balances',
      '.investment-positions-list', '.market-search-results', '.market-quote-card', '.market-history-content',
      'dialog[open]', '.language-selector-menu', '.birth-date-popover', '.mascot-chat',
    ].join(','))];
    const overlaps: string[] = [];
    for (const group of document.querySelectorAll('.login-brand-nav, .account-user, .account-overview, .account-destinations, .investment-categories, .investment-portfolio-breakdown, .investment-result-values, .market-quote-grid, .market-details-card dl')) {
      const children = [...group.children].filter(element => element.getClientRects().length);
      for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
        const a = children[i]!.getBoundingClientRect();
        const b = children[j]!.getBoundingClientRect();
        if (a.width && a.height && b.width && b.height && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(group.className);
      }
    }
    return {
      document: document.documentElement.scrollWidth - width,
      overlaps,
      elements: roots.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        .filter(element => {
          const box = element.getBoundingClientRect();
          return box.left < -1 || box.right > width + 1 || element.scrollWidth > element.clientWidth + 2;
        }).map(element => ({ name: element.className, width: element.clientWidth, scroll: element.scrollWidth, box: element.getBoundingClientRect().toJSON() })),
    };
  });
  expect(overflow, label).toEqual({ document: 0, elements: [], overlaps: [] });
}

for (const [index, width] of widths.entries()) {
  for (const theme of ['light', 'dark']) {
    test(`${width}px · ${theme} · all screens`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.addInitScript(locale => localStorage.setItem('tivvo.idioma', locale), ['pt-BR', 'en', 'es'][index % 3]!);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const view of views) {
        await open(page, view, theme);
        await assertLayout(page, `${view} ${width} ${theme}`);
      }
      expect(errors).toEqual([]);
    });
  }
}

for (const locale of ['pt-BR', 'en', 'es']) {
  for (const theme of ['light', 'dark']) {
    test(`long content · ${locale} · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.addInitScript(value => localStorage.setItem('tivvo.idioma', value), locale);
      for (const view of ['home', 'profile', 'history', 'currencies', 'pix', 'investments', 'transfer', 'holdings', 'error']) {
        await open(page, view, theme, '&stress=true');
        if (view === 'home') await page.locator('.account-balance-label button').click();
        if (view === 'pix') await page.locator('.operation-balance-visibility').click();
        await assertLayout(page, `long ${view} ${locale} ${theme}`);
      }
    });
  }
}

test('language dropdown, keyboard, focus, outside click and persistence', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await open(page, 'login');
  const trigger = page.locator('.language-selector-trigger');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible();
  await assertLayout(page, 'login dropdown');
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio').last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('ES');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toBeHidden();
  await trigger.click();
  await page.locator('.login-brand-nav > span').click();
  await expect(page.getByRole('menu')).toBeHidden();
  await open(page, 'home');
  await expect(page.locator('.language-selector-trigger')).toContainText('ES');
});

test('calendar, about modal, assistant and orientation changes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await open(page, 'signup');
  await page.locator('button[aria-haspopup="dialog"][aria-expanded]').click();
  await expect(page.locator('.tivvo-calendar')).toBeVisible();
  await assertLayout(page, 'calendar');
  await open(page, 'home');
  await page.locator('.account-about-trigger').click();
  await expect(page.locator('.tivvo-about')).toBeVisible();
  await assertLayout(page, 'about');
  await page.keyboard.press('Escape');
  await page.locator('.live-orb-trigger').click();
  await expect(page.locator('.mascot-chat')).toBeVisible();
  await assertLayout(page, 'chat');
  for (const viewport of [{ width: 844, height: 390 }, { width: 1024, height: 600 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await assertLayout(page, `chat resize ${viewport.width}`);
    const box = await page.locator('.mascot-chat').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
});

test('receipts, purchase review and sale forms fit short screens and scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await open(page, 'pix');
  await page.locator('input[type="email"]').fill('destinatario@exemplo.com');
  await page.locator('#pix-value').fill('100');
  await page.locator('.account-pix-submit').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await assertLayout(page, 'pix receipt');
  await open(page, 'transfer');
  await page.locator('.investment-transfer-form input:not([type="hidden"])').fill('100');
  await page.locator('.account-pix-submit').click();
  await assertLayout(page, 'transfer receipt');
  await open(page, 'stocks');
  await page.locator('.market-buy-form button').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await assertLayout(page, 'purchase review');
  await page.locator('dialog[open] .account-pix-success-close').click();
  await assertLayout(page, 'purchase receipt');
  await open(page, 'holdings');
  await page.locator('.investment-sell-toggle').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await assertLayout(page, 'sale review');
  await page.locator('#sell-dialog-quantity').fill('1');
  await page.locator('dialog[open] button[type="submit"]').click();
  await assertLayout(page, 'sale receipt');
  await open(page, 'error', 'dark', '&stress=true');
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toHaveCSS('scrollbar-width', 'none');
  await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await assertLayout(page, 'scrolling error');
});

test('loading, empty and error states at intermediate widths', async ({ page }) => {
  for (const width of [360, 600, 820, 1100, 1600]) {
    await page.setViewportSize({ width, height: 700 });
    for (const state of ['loading', 'empty', 'error']) {
      for (const view of ['history', 'investments', 'holdings']) {
        await open(page, view, 'dark', `&state=${state}`);
        await assertLayout(page, `${state} ${view} ${width}`);
      }
    }
  }
});

test('visual samples and chart interaction after resizing', async ({ page }, testInfo) => {
  for (const width of [375, 1024, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 });
    for (const theme of ['light', 'dark']) {
      for (const view of ['home', 'stocks', 'login', 'signup', 'history', 'investments', 'transfer']) {
        await open(page, view, theme);
        await assertLayout(page, `visual ${view} ${width} ${theme}`);
        await page.screenshot({ path: testInfo.outputPath(`${view}-${width}-${theme}.png`), fullPage: true });
        if (view === 'stocks') {
          const chart = page.locator('.market-history-chart svg');
          await chart.focus();
          await page.keyboard.press('Home');
          await expect(page.locator('.market-history-value')).toContainText('40,00');
          await page.keyboard.press('End');
          await expect(page.locator('.market-history-value')).toContainText('40,75');
          const bounds = await chart.boundingBox();
          await page.mouse.move(bounds!.x + bounds!.width - 20, bounds!.y + 100);
          await expect(page.locator('.market-history-value')).toContainText('40,75');
        }
      }
    }
  }
});

for (const locale of ['pt-BR', 'en', 'es']) {
  test(`authentication layouts with translated copy · ${locale}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('tivvo.idioma', value), locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      for (const view of ['login', 'signup']) {
        await open(page, view);
        await assertLayout(page, `translated ${view} ${width} ${locale}`);
      }
    }
  });
}
