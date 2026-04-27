const SHEET_DCA = 'DCA_LOG';
const SHEET_SIGNAL = 'SIGNAL_LOG';
const SHEET_CONFIG = 'CONFIG';

function doGet(e) {
  try {
    const action = getParam(e, 'action', 'all');
    const callback = getParam(e, 'callback', '');
    let payload;

    if (action === 'records') {
      payload = { success: true, data: getAllRecords() };
    } else if (action === 'summary') {
      payload = { success: true, data: getSummary() };
    } else if (action === 'signal') {
      payload = { success: true, data: getLastSignal() };
    } else if (action === 'saveDCA') {
      payload = {
        success: true,
        message: 'DCA record saved',
        data: saveDCARecord({
          date: getParam(e, 'date', ''),
          amountLak: getParam(e, 'amountLak', 0),
          feeLak: getParam(e, 'feeLak', 0),
          usdRate: getParam(e, 'usdRate', 0),
          btcPriceUsd: getParam(e, 'btcPriceUsd', 0),
          source: getParam(e, 'source', 'WEB_APP'),
          note: getParam(e, 'note', '')
        })
      };
    } else if (action === 'updateDCA') {
      payload = {
        success: true,
        message: 'DCA record updated',
        data: updateDCARecord({
          id: getParam(e, 'id', ''),
          date: getParam(e, 'date', ''),
          amountLak: getParam(e, 'amountLak', 0),
          feeLak: getParam(e, 'feeLak', 0),
          usdRate: getParam(e, 'usdRate', 0),
          btcPriceUsd: getParam(e, 'btcPriceUsd', 0),
          source: getParam(e, 'source', 'WEB_APP'),
          note: getParam(e, 'note', '')
        })
      };
    } else if (action === 'deleteDCA') {
      payload = {
        success: true,
        message: 'DCA record deleted',
        data: deleteDCARecord(getParam(e, 'id', ''))
      };
    } else if (action === 'saveSignal') {
      payload = {
        success: true,
        message: 'Signal saved',
        data: saveSignal(
          getParam(e, 'signal', 'HOLD'),
          getParam(e, 'confidence', 0),
          getParam(e, 'reason', ''),
          getParam(e, 'rsiInterpretation', ''),
          getParam(e, 'dcaAdvice', ''),
          getParam(e, 'rawJson', ''),
          getParam(e, 'btcPriceUsd', 0),
          getParam(e, 'rsi14', 0),
          getParam(e, 'avgCostLak', 0),
          getParam(e, 'totalBtc', 0),
          getParam(e, 'pnlPercent', 0)
        )
      };
    } else if (action === 'analyzeSignal') {
      payload = {
        success: true,
        message: 'Signal analyzed',
        data: analyzeAndSaveSignal({
          price: getParam(e, 'price', 0),
          priceHistory: getParam(e, 'priceHistory', '[]'),
          rsi: getParam(e, 'rsi', 0),
          avgCostLak: getParam(e, 'avgCostLak', 0),
          totalBtc: getParam(e, 'totalBtc', 0),
          pnlPercent: getParam(e, 'pnlPercent', 0),
          monthlyTargetLak: getParam(e, 'monthlyTargetLak', 0)
        })
      };
    } else {
      payload = {
        success: true,
        data: {
          records: getAllRecords(),
          summary: getSummary(),
          lastSignal: getLastSignal()
        }
      };
    }

    return outputResponse(payload, callback);
  } catch (error) {
    return outputResponse({ success: false, error: error.message }, getParam(e, 'callback', ''));
  }
}

function outputResponse(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getParam(e, key, fallback) {
  if (!e || !e.parameter || typeof e.parameter[key] === 'undefined') {
    return fallback;
  }
  return e.parameter[key];
}

function getSheetOrThrow(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet ' + name + ' not found');
  }
  return sheet;
}

function calculateDerivedFields(data) {
  const amountLak = toNumber(data.amountLak);
  const feeLak = toNumber(data.feeLak);
  const usdRate = toNumber(data.usdRate);
  const btcPriceUsd = toNumber(data.btcPriceUsd);
  const netLak = amountLak - feeLak;
  const usdBeforeFee = usdRate > 0 ? amountLak / usdRate : 0;
  const usdAfterFee = usdRate > 0 ? netLak / usdRate : 0;
  const btcReceived = btcPriceUsd > 0 ? usdAfterFee / btcPriceUsd : 0;

  return {
    amountLak: amountLak,
    feeLak: feeLak,
    netLak: netLak,
    usdRate: usdRate,
    usdBeforeFee: usdBeforeFee,
    usdAfterFee: usdAfterFee,
    btcPriceUsd: btcPriceUsd,
    btcReceived: btcReceived
  };
}

function saveDCARecord(data) {
  const sheet = getSheetOrThrow(SHEET_DCA);
  const id = generateId('DCA', sheet.getLastRow());
  const calc = calculateDerivedFields(data);
  const createdAt = new Date();

  sheet.appendRow([
    id,
    data.date || '',
    calc.amountLak,
    calc.feeLak,
    calc.netLak,
    calc.usdRate,
    calc.usdBeforeFee,
    calc.usdAfterFee,
    calc.btcPriceUsd,
    calc.btcReceived,
    data.source || 'WEB_APP',
    data.note || '',
    createdAt
  ]);

  return { id: id };
}

function updateDCARecord(data) {
  const sheet = getSheetOrThrow(SHEET_DCA);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('No DCA records found');
  }

  const rowIndex = findRowIndexById(values, String(data.id || ''));
  if (rowIndex === -1) {
    throw new Error('DCA record not found: ' + data.id);
  }

  const calc = calculateDerivedFields(data);
  const range = sheet.getRange(rowIndex + 1, 1, 1, 13);
  const existingId = values[rowIndex][0];
  const createdAt = values[rowIndex][12] || new Date();

  range.setValues([[
    existingId,
    data.date || '',
    calc.amountLak,
    calc.feeLak,
    calc.netLak,
    calc.usdRate,
    calc.usdBeforeFee,
    calc.usdAfterFee,
    calc.btcPriceUsd,
    calc.btcReceived,
    data.source || 'WEB_APP',
    data.note || '',
    createdAt
  ]]);

  return { id: existingId };
}

function deleteDCARecord(id) {
  const sheet = getSheetOrThrow(SHEET_DCA);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('No DCA records found');
  }

  const rowIndex = findRowIndexById(values, String(id || ''));
  if (rowIndex === -1) {
    throw new Error('DCA record not found: ' + id);
  }

  sheet.deleteRow(rowIndex + 1);
  return { id: id };
}

function findRowIndexById(values, id) {
  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][0]) === id) {
      return i;
    }
  }
  return -1;
}

function getAllRecords() {
  const sheet = getSheetOrThrow(SHEET_DCA);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) { return cell !== ''; });
    })
    .map(function(row) {
      return rowToObject(headers, row);
    });
}

function getSummary() {
  const records = getAllRecords();
  let totalInvestLak = 0;
  let totalNetLak = 0;
  let totalBtc = 0;
  let totalUsdAfterFee = 0;

  records.forEach(function(record) {
    totalInvestLak += toNumber(record.AMOUNT_LAK);
    totalNetLak += toNumber(record.NET_LAK);
    totalBtc += toNumber(record.BTC_RECEIVED);
    totalUsdAfterFee += toNumber(record.USD_AFTER_FEE);
  });

  return {
    totalRecords: records.length,
    totalInvestLak: totalInvestLak,
    totalNetLak: totalNetLak,
    totalBtc: totalBtc,
    totalUsdAfterFee: totalUsdAfterFee,
    avgCostLak: totalBtc > 0 ? totalNetLak / totalBtc : 0
  };
}

function getLastSignal() {
  const sheet = getSheetOrThrow(SHEET_SIGNAL);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0];
  const rows = values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ''; });
  });
  if (rows.length === 0) return null;

  return rowToObject(headers, rows[rows.length - 1]);
}

function saveSignal(signal, confidence, reason, rsiInterpretation, dcaAdvice, rawJson, btcPriceUsd, rsi14, avgCostLak, totalBtc, pnlPercent) {
  const sheet = getSheetOrThrow(SHEET_SIGNAL);
  const id = generateId('SIG', sheet.getLastRow());
  const timestamp = new Date();

  sheet.appendRow([
    id,
    timestamp,
    toNumber(btcPriceUsd),
    toNumber(rsi14),
    toNumber(avgCostLak),
    toNumber(totalBtc),
    toNumber(pnlPercent),
    signal || 'HOLD',
    toNumber(confidence),
    reason || '',
    rsiInterpretation || '',
    dcaAdvice || '',
    rawJson || ''
  ]);

  return { id: id, timestamp: timestamp };
}

function analyzeAndSaveSignal(context) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('ANTHROPIC_API_KEY');
  const model = props.getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514';

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in Script Properties');
  }

  const priceHistory = parseJsonArray(context.priceHistory);
  const systemPrompt = 'You are a DCA Bitcoin trading advisor. Analyze the given market data and portfolio context. Respond ONLY in JSON format with keys signal, confidence, reason, rsi_interpretation, dca_advice.';
  const userPrompt =
    'BTC current price: ' + context.price + ' usd\n' +
    '7-day price history: ' + JSON.stringify(priceHistory) + '\n' +
    'RSI (14): ' + context.rsi + '\n' +
    'My DCA average cost: ' + context.avgCostLak + ' LAK\n' +
    'Current profit/loss: ' + context.pnlPercent + '%\n' +
    'Monthly DCA target: ' + context.monthlyTargetLak + ' LAK\n\n' +
    'Analyze and return signal with Thai reason.';

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model: model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Anthropic API error: ' + status + ' ' + text);
  }

  const apiPayload = JSON.parse(text);
  const contentText = extractAnthropicText(apiPayload);
  const signalPayload = extractSignalJson(contentText);

  saveSignal(
    signalPayload.signal,
    signalPayload.confidence,
    signalPayload.reason,
    signalPayload.rsi_interpretation,
    signalPayload.dca_advice,
    JSON.stringify(signalPayload),
    context.price,
    context.rsi,
    context.avgCostLak,
    context.totalBtc,
    context.pnlPercent
  );

  return signalPayload;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function extractAnthropicText(apiPayload) {
  if (!apiPayload || !apiPayload.content || !apiPayload.content.length) {
    throw new Error('Claude response did not contain content');
  }

  var text = '';
  apiPayload.content.forEach(function(block) {
    if (block.type === 'text') {
      text += block.text;
    }
  });

  if (!text) {
    throw new Error('Claude response text was empty');
  }

  return text;
}

function extractSignalJson(text) {
  var cleaned = String(text || '').trim();
  var firstBrace = cleaned.indexOf('{');
  var lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('Claude response was not valid JSON: ' + cleaned);
  }

  var jsonText = cleaned.substring(firstBrace, lastBrace + 1);
  var payload = JSON.parse(jsonText);

  return {
    signal: String(payload.signal || 'HOLD').toUpperCase(),
    confidence: toNumber(payload.confidence),
    reason: String(payload.reason || ''),
    rsi_interpretation: String(payload.rsi_interpretation || ''),
    dca_advice: String(payload.dca_advice || '')
  };
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach(function(header, index) {
    obj[header] = row[index];
  });
  return obj;
}

function toNumber(value) {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

function generateId(prefix, rowNumber) {
  const num = Math.max(1, rowNumber);
  return prefix + '-' + Utilities.formatString('%04d', num);
}
