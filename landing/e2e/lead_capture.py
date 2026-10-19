"""Synthetic-only Playwright acceptance. Start the documented local receiver and Vite first.
Requires Playwright in an external virtualenv and a local Chrome installation.
Never point this test at a production receiver.
"""
import asyncio
import json
import os
import sqlite3
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get('LEAD_TEST_URL', 'http://localhost:5189')
DB = os.environ.get('LEAD_TEST_DB', '/tmp/lead-001-runtime-e2e/leads.sqlite')
OUT = Path(os.environ.get('LEAD_TEST_EVIDENCE', '/tmp/lead-001-e2e'))
if not BASE.startswith('http://localhost:') or not DB.startswith('/tmp/'):
    raise SystemExit('Only isolated localhost and temporary synthetic storage are authorized')

async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    results = {'scope': 'local synthetic receiver and captured mail; no production email', 'widths': [], 'checks': []}
    async with async_playwright() as p:
        launch = {'executable_path': os.environ['LEAD_TEST_BROWSER']} if os.environ.get('LEAD_TEST_BROWSER') else {'channel': 'chrome'}
        browser = await p.chromium.launch(**launch, headless=True)
        page = await browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        for width in [1440, 1280, 768, 390, 320]:
            await page.set_viewport_size({'width': width, 'height': 900})
            await page.goto(BASE, wait_until='networkidle')
            form = page.locator('#demo form')
            await form.scroll_into_view_if_needed()
            await page.wait_for_timeout(300)
            assert await form.count() == 1
            assert await page.locator('#demo h2').evaluate('(el) => getComputedStyle(el).color') == 'rgb(255, 255, 255)'
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            for name in ['name', 'company', 'email', 'phone', 'interest', 'message', 'consent']:
                control = form.locator(f'[name="{name}"]')
                assert await control.is_visible()
                box = await control.bounding_box()
                assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1
            await form.locator('[name="name"]').focus()
            await page.keyboard.press('Tab')
            assert await form.locator('[name="email"]').evaluate('(el) => el === document.activeElement')
            await page.screenshot(path=str(OUT / f'form-{width}.png'))
            results['widths'].append({'width': width, 'overflow': False, 'heading_white': True, 'keyboard': 'PASS'})
        await page.emulate_media(reduced_motion='reduce')
        await page.reload(wait_until='networkidle')
        assert await page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')
        form = page.locator('#demo form')
        await form.scroll_into_view_if_needed()
        button = form.locator('button[type="submit"]')
        await button.click()
        assert await form.locator(':invalid').count() >= 1
        await form.locator('[name="name"]').fill('Synthetic Person')
        await form.locator('[name="company"]').fill('Synthetic Business')
        await form.locator('[name="email"]').fill('invalid')
        assert not await form.locator('[name="email"]').evaluate('(el) => el.checkValidity()')
        await form.locator('[name="email"]').fill('lead@example.test')
        await button.click()
        assert not await form.locator('[name="consent"]').evaluate('(el) => el.checkValidity()')
        await form.locator('[name="consent"]').check()
        await page.wait_for_timeout(2100)
        # An HTTP200 without durable receipt is explicitly NOT acceptance evidence.
        keys = []
        async def unconfirmed(route):
            keys.append(route.request.headers.get('idempotency-key'))
            await route.fulfill(status=200, content_type='application/json', body='{"accepted":true}')
        await page.route('**/__lead-local/leads', unconfirmed)
        await button.click()
        await page.get_by_text('No se confirmó la recepción.', exact=False).wait_for()
        assert await page.get_by_text('¡Solicitud recibida!', exact=True).count() == 0
        await page.unroute('**/__lead-local/leads', unconfirmed)
        async with page.expect_response(lambda r: '/__lead-local/leads' in r.url) as response_info:
            await button.click()
        response = await response_info.value
        body = await response.json()
        assert response.status == 201 and body['accepted'] is True and body['receipt'] == 'stored'
        assert response.request.headers['idempotency-key'] == keys[0]
        await page.get_by_text('¡Solicitud recibida!', exact=True).wait_for()
        assert await button.is_disabled()
        assert await form.locator('[role="status"]').evaluate('(el) => el === document.activeElement')
        await page.screenshot(path=str(OUT / 'success-320.png'))
        # Reload creates a new browser key, but identical payload must not create another lead.
        await page.reload(wait_until='networkidle')
        form = page.locator('#demo form')
        for name, value in {'name': 'Synthetic Person', 'company': 'Synthetic Business', 'email': 'lead@example.test'}.items():
            await form.locator(f'[name="{name}"]').fill(value)
        await form.locator('[name="consent"]').check()
        await page.wait_for_timeout(2100)
        async with page.expect_response(lambda r: '/__lead-local/leads' in r.url) as response_info:
            await form.locator('button[type="submit"]').click()
        duplicate = await (await response_info.value).json()
        assert duplicate['duplicate'] is True and duplicate['reference'] == body['reference']
        await page.get_by_text('Esta solicitud ya estaba registrada.', exact=False).wait_for()
        # Independent SQLite readback: actual disk persistence plus asynchronous local mail capture.
        for _ in range(15):
            with sqlite3.connect(DB) as db:
                leads = db.execute('select count(*) from leads').fetchone()[0]
                mails = db.execute('select count(*) from captured_mail').fetchone()[0]
                states = db.execute('select state from leads').fetchall()
                if leads == mails == 1 and states == [('sent',)]: break
            await page.wait_for_timeout(1000)
        assert leads == mails == 1 and states == [('sent',)]
        results['checks'] = ['required fields', 'invalid email', 'required consent', 'unconfirmed HTTP200 rejected (stub)', 'real localhost durable POST', 'retry same key', 'duplicate same reference', 'disk readback', 'one captured mail', 'success keyboard focus', 'reduced-motion enabled']
        results['database'] = {'leads': leads, 'captured_mail': mails, 'notification': 'sent (local capture only)'}
        results['page_errors'] = errors
        assert not errors
        await browser.close()
    (OUT / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))

asyncio.run(run())
