import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
REPO=Path(__file__).resolve().parents[1]
ROOT=Path(os.environ.get('RW_TEST_ARTIFACTS', str(REPO/'test-artifacts')))
ROOT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('RW_TEST_URL','http://127.0.0.1:8766')
async def main():
  report={'errors':[],'routes':[]}
  async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or None,args=['--no-sandbox'])
    for name,width,height in [('desktop',1440,1000),('mobile',390,844),('small-mobile',320,740)]:
      context=await browser.new_context(viewport={'width':width,'height':height},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
      page=await context.new_page()
      page.on('pageerror',lambda e:report['errors'].append(str(e)))
      await page.goto(URL+'/index.html')
      await page.wait_for_timeout(500)
      routes=await page.locator('#tabs a').evaluate_all('(els)=>els.map(e=>e.hash)')
      assert '#method' not in routes,'方法仍在主导航'
      for route in routes:
        await page.evaluate('(r)=>location.hash=r',route)
        await page.wait_for_timeout(400)
        text=await page.locator('#app').inner_text()
        assert len(text)>20,(name,route,'empty')
        assert 'NaN' not in text and 'Infinity' not in text,(name,route,'bad number')
        overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        if overflow:report['errors'].append(f'{name} {route} horizontal overflow')
        await page.screenshot(path=str(ROOT/f'{name}-{route[1:]}.png'),full_page=True)
        report['routes'].append({'viewport':name,'route':route,'characters':len(text),'overflow':overflow})
      await context.close()
    # Fresh file:// load without server
    page=await browser.new_page()
    page.on('pageerror',lambda e:report['errors'].append('file:// '+str(e)))
    await page.goto((REPO/'index.html').as_uri())
    assert len(await page.locator('#app').inner_text())>20
    await browser.close()
  (ROOT/'ui-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps(report,ensure_ascii=False,indent=2))
  assert not report['errors']
asyncio.run(main())
