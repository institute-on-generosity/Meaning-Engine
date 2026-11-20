/**
 * GuideGPT usage dashboard (Google Apps Script, bound to a Google Sheet).
 *
 * GuideGPT posts one anonymous event per row: a session started, a reflection or plan created, or
 * a survey answer. No conversation text is ever sent. This script stores them in an "Events" tab
 * and builds a "Dashboard" tab with the project's success metrics.
 *
 * Setup (once):
 *   1. Create a Google Sheet. Open Extensions → Apps Script, paste this whole file, and save.
 *   2. In the function menu, pick `setupDashboard` and click Run (approve the permissions it asks for).
 *   3. Click Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
 *      Deploy, and copy the web app URL.
 *   4. In Vercel (project → Settings → Environment Variables), set FEEDBACK_WEBHOOK_URL to that URL,
 *      then redeploy GuideGPT.
 * Keep the URL private: anyone who has it can add rows.
 */

var EVENT_COLUMNS = ['at', 'type', 'mode', 'advisor', 'turns', 'seconds', 'rating', 'comment', 'model'];

/** Receives one event from GuideGPT and appends it to the Events tab. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = eventsSheet_();
    var d = JSON.parse(e.postData.contents);
    sheet.appendRow(EVENT_COLUMNS.map(function (key) {
      if (key === 'at') return d.at ? new Date(d.at) : new Date();
      var value = d[key];
      return value === undefined || value === null ? '' : value;
    }));
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function eventsSheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName('Events') || book.insertSheet('Events');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EVENT_COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  return sheet;
}

/**
 * Builds (or rebuilds) the Dashboard tab. Every number is a live formula over the Events tab, so it
 * stays current as events arrive. Safe to run again: it replaces the old Dashboard.
 * Events columns: A at, B type, C mode, D advisor, E turns, F seconds, G rating, H comment, I model.
 */
function setupDashboard() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  eventsSheet_();
  var old = book.getSheetByName('Dashboard');
  if (old) book.deleteSheet(old);
  var dash = book.insertSheet('Dashboard', 0);

  var E = 'Events!';
  var started = 'COUNTIF(' + E + 'B:B,"session_started")';
  var completed = 'COUNTIF(' + E + 'B:B,"reflection_created")';
  var surveys = 'COUNTIF(' + E + 'B:B,"survey")';
  var positive = '(COUNTIFS(' + E + 'B:B,"survey",' + E + 'G:G,"insightful")+COUNTIFS(' + E + 'B:B,"survey",' + E + 'G:G,"useful"))';

  var rows = [
    ['GuideGPT usage', '', 'Goal'],
    ['Sessions started', '=' + started, ''],
    ['Sessions completed (reflection or plan created)', '=' + completed, 200],
    ['Completion rate', '=IFERROR(' + completed + '/' + started + ',0)', ''],
    ['Survey answers', '=' + surveys, ''],
    ['Rated "insightful" or "useful"', '=IFERROR(' + positive + '/' + surveys + ',0)', 0.75],
    ['Average minutes to completion', '=IFERROR(AVERAGEIFS(' + E + 'F:F,' + E + 'B:B,"reflection_created",' + E + 'F:F,">0")/60,0)', 5],
    ['Average messages per completed session', '=IFERROR(AVERAGEIFS(' + E + 'E:E,' + E + 'B:B,"reflection_created"),0)', ''],
    ['Sessions on the kiosk', '=COUNTIFS(' + E + 'B:B,"session_started",' + E + 'C:C,"kiosk")', ''],
  ];
  dash.getRange(1, 1, rows.length, 3).setValues(rows);
  dash.getRange('A1:C1').setFontWeight('bold');
  dash.getRange('B4').setNumberFormat('0%');
  dash.getRange('B6:C6').setNumberFormat('0%');
  dash.getRange('B7:B8').setNumberFormat('0.0');

  // By advisor.
  dash.getRange('A11').setValue('By advisor').setFontWeight('bold');
  dash.getRange('A12').setFormula(
    '=QUERY(' + E + 'A:I,"select D, count(B) where B = \'session_started\' and D <> \'\' group by D label D \'Advisor\', count(B) \'Sessions started\'",1)');
  dash.getRange('D12').setFormula(
    '=QUERY(' + E + 'A:I,"select D, count(B) where B = \'reflection_created\' and D <> \'\' group by D label D \'Advisor\', count(B) \'Completed\'",1)');

  // Sessions per day, with a chart.
  dash.getRange('A20').setValue('Sessions started per day').setFontWeight('bold');
  dash.getRange('A21').setFormula(
    '=QUERY(' + E + 'A:I,"select toDate(A), count(B) where B = \'session_started\' group by toDate(A) label toDate(A) \'Day\', count(B) \'Sessions\'",1)');
  var chart = dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange('A21:B200'))
    .setPosition(20, 4, 0, 0)
    .setOption('title', 'Sessions started per day')
    .setOption('legend', { position: 'none' })
    .build();
  dash.insertChart(chart);

  // Most recent survey comments.
  dash.getRange('A42').setValue('Recent survey comments').setFontWeight('bold');
  dash.getRange('A43').setFormula(
    '=QUERY(' + E + 'A:I,"select A, D, G, H where B = \'survey\' and H <> \'\' order by A desc limit 25 label A \'When\', D \'Advisor\', G \'Rating\', H \'Comment\'",1)');

  dash.setColumnWidth(1, 330);
  dash.setFrozenRows(1);
}
