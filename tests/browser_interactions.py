import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
REPO=Path(__file__).resolve().parents[1]
ROOT=Path(os.environ.get('RW_TEST_ARTIFACTS',str(REPO/'test-artifacts')))
ROOT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('RW_TEST_URL','http://127.0.0.1:8766')
async def main():
  checks=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or None,args=['--no-sandbox'])
    context=await b.new_context(viewport={'width':390,'height':844},accept_downloads=True,timezone_id='Asia/Shanghai')
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.clock.install(time=__import__('datetime').datetime(2026,11,25,8,0,tzinfo=__import__('datetime').timezone.utc))
    await page.goto(URL+'/index.html#tools/calc')
    assert '1:45:46' in await page.locator('#equivOut').inner_text()
    checks.append('默认5公里23分钟→半马1:45:46')
    await page.locator('#equivForm [name=mode]').select_option('vo2max')
    assert '无法单值预测' in await page.locator('#equivOut').inner_text()
    await page.locator('#equivForm [name=assume]').check()
    await page.locator('#equivForm button').click()
    assert '非预测' in await page.locator('#equivOut').inner_text()
    checks.append('VO2max62默认不当VDOT，主动假设后才显示整分钟参考')
    await page.locator('#equivForm [name=mode]').select_option('race')
    await page.locator('#equivForm [name=time]').fill('23:60')
    await page.locator('#equivForm button').click()
    assert '有效' in await page.locator('#equivOut').inner_text()
    checks.append('非法秒输入报错')
    await page.locator('#marathonForm [name=time]').fill('2:45:00')
    await page.locator('#marathonForm button').click()
    assert '3:55' in await page.locator('#marathonOut').inner_text()
    assert '2:45:00' in await page.locator('#marathonOut').inner_text()
    await page.locator('#marathonForm [name=source]').select_option('pace')
    await page.locator('#marathonForm [name=pace]').fill('4:00')
    await page.locator('#marathonForm button').click()
    assert '2:48:47' in await page.locator('#marathonOut').inner_text()
    checks.append('马拉松目标/配速双向与终点分段')
    await page.goto(URL+'/index.html#training/plan')
    assert await page.evaluate('localStorage.getItem("rw.plan.v1")') is None
    await page.locator('#planForm [name=structure]').fill('轻松跑，按体感')
    await page.locator('#planForm [name=km]').fill('6')
    await page.locator('#planForm button[type=submit],#planForm button:not([type])').first.click()
    assert '已保存' in await page.locator('#planMsg').inner_text()
    doc=json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))
    assert len(doc['items'])==1 and doc['items'][0]['status']=='未确认'
    await page.locator('[data-edit]').first.click()
    await page.locator('#planForm [name=status]').select_option('完成')
    await page.locator('#planForm [name=rpe]').fill('4')
    await page.locator('#planForm [name=feedback]').fill('状态良好')
    await page.locator('#planForm button:not([type])').click()
    await page.reload()
    doc=json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))
    assert len(doc['items'])==1 and doc['items'][0]['rpe']==4 and doc['items'][0]['status']=='完成'
    checks.append('课表默认空、新建、编辑完成/RPE/反馈、刷新持久化')
    async with page.expect_download() as dl:
      await page.locator('#planExport').click()
    download=await dl.value
    await download.save_as(str(ROOT/'exported-plan.json'))
    assert json.loads((ROOT/'exported-plan.json').read_text())==doc
    checks.append('课表JSON导出内容与本地一致')
    await page.locator('#planImport').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":99,"items":[]}'})
    await page.wait_for_timeout(200)
    assert '导入失败' in await page.locator('#planMsg').inner_text()
    assert json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))==doc
    page.on('dialog',lambda d:d.accept())
    await page.locator('#planImport').set_input_files(str(ROOT/'exported-plan.json'))
    await page.wait_for_timeout(200)
    assert '已导入' in await page.locator('#planMsg').inner_text()
    checks.append('课表有效JSON导入、非法文件拒绝且不覆盖数据')
    await page.locator('#generateDraft').click()
    assert await page.locator('#confirmDraft').count()==1
    assert json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))==doc
    await page.locator('#confirmDraft').click()
    size=len(json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))['items'])
    await page.locator('#generateDraft').click()
    await page.locator('#confirmDraft').click()
    assert len(json.loads(await page.evaluate('localStorage.getItem("rw.plan.v1")'))['items'])==size
    checks.append('减量草案先预览、确认后保存、重复生成不重复同日课表')
    await page.goto(URL+'/index.html#tools/settings')
    csv='活动类型,日期,标题,距离,时间,移动时间,平均心率,最大心率\n跑步,2026-11-24 07:00:00,测试,0.92,00:07:26.9,00:07:26.9,140,185\n'
    await page.locator('#csvMode').select_option('replace')
    await page.locator('#csvFile').set_input_files({'name':'fixture.csv','mimeType':'text/csv','buffer':csv.encode('utf-8')})
    await page.locator('#csvGo').click()
    await page.wait_for_timeout(250)
    imported=json.loads(await page.evaluate('localStorage.getItem("rw.activities")'))
    assert len(imported['activities'])==1
    assert imported['activities'][0]['movS']==446.9
    checks.append('Garmin小数秒CSV本地导入（合成用例）')
    await page.goto(URL+'/index.html#analysis/fitness')
    assert await page.locator('#taperChart').count()==1
    before=await page.locator('.scenario-result').inner_text()
    await page.locator('#taperPct').select_option('0')
    assert await page.locator('#taperPct').input_value()=='0'
    assert await page.locator('.scenario-result').inner_text()!=before
    checks.append('减量模拟比例调整可重算，不写入课表')
    await page.goto(URL+'/index.html#records')
    await page.locator('#recSearch').fill('不存在的训练标题')
    await page.locator('#recSearch').press('Tab')
    assert '共 0 条' in await page.locator('#app').inner_text()
    await page.locator('#recSearch').fill('测试')
    await page.locator('#recSearch').press('Tab')
    assert '共 1 条' in await page.locator('#app').inner_text()
    await page.locator('[data-race]').first.click()
    assert '★' in await page.locator('[data-race]').first.inner_text()
    checks.append('记录搜索筛选、手动确认比赛')
    await page.goto(URL+'/index.html#training/journal')
    await page.locator('#journalForm [name=restHr]').fill('51')
    await page.locator('#journalForm [name=weight]').fill('61.2')
    await page.locator('#journalForm [name=pain]').check()
    await page.locator('#journalForm button').click()
    journal=json.loads(await page.evaluate('localStorage.getItem("rw.journal.v1")'))
    assert journal['entries'][0]['pain'] is True
    await page.reload()
    assert await page.locator('#journalForm [name=restHr]').input_value()=='51'
    await page.locator('#journalImport').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":2,"entries":[]}'})
    await page.wait_for_timeout(200)
    assert json.loads(await page.evaluate('localStorage.getItem("rw.journal.v1")'))==journal
    await page.goto(URL+'/index.html#status')
    assert '就医' in await page.locator('.coach').inner_text()
    await page.screenshot(path=str(ROOT/'journal-safety.png'),full_page=True)
    checks.append('日志保存、刷新、非法导入不覆盖、病痛安全优先')
    entries=[dict(journal['entries'][0],date=d,restHr=h,pain=False) for d,h in [('2026-11-23',50),('2026-11-24',52),('2026-11-25',54)]]
    await page.goto(URL+'/index.html#training/journal')
    await page.locator('#journalImport').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps({'version':1,'entries':entries}).encode()})
    await page.wait_for_timeout(200)
    await page.goto(URL+'/index.html#tools/settings')
    assert '日志中位数 3 条（52）' in await page.locator('#app').inner_text()
    await page.locator('#settingsForm [name=restHr]').fill('49')
    await page.locator('#settingsForm [name=restHrManual]').check()
    await page.locator('#settingsForm button').click()
    assert '静息心率来源：手动 49' in await page.locator('#app').inner_text()
    await page.locator('#clearRestHr').click()
    assert '日志中位数 3 条（52）' in await page.locator('#app').inner_text()
    checks.append('日志中位数来源、手动优先与清除手动值')
    await page.goto(URL+'/index.html#overview')
    await page.wait_for_function('location.hash === "#status"')
    await page.goto(URL+'/index.html#planner')
    await page.wait_for_function('location.hash === "#training/plan"')
    checks.append('旧hash自动重定向')
    assert not errors, errors
    await b.close()
  (ROOT/'interaction-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
  print(json.dumps(checks,ensure_ascii=False,indent=2))
asyncio.run(main())
