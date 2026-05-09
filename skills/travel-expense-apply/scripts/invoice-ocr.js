#!/usr/bin/env node

const http = require('http');
const path = require('path');
const { getAuthHeaders } = require(path.join(__dirname, 'token-manager'));

const BASE_URL = process.env.TRAVEL_APPLY_BASE_URL || 'http://221.224.251.134:6770/api/';
console.error('[DEBUG] BASE_URL:', BASE_URL);

function safeJsonParse(str) {
  const safe = str.replace(
      /("(?:[^"\\]|\\.)*")|(\b\d{16,}\b)/g,
      (match, str, num) => num ? `"${num}"` : match
  );
  return JSON.parse(safe);
}

function safeJsonStringify(obj) {
  return JSON.stringify(obj).replace(
      /"(-?\d{16,})"/g,
      '$1'
  );
}

function requestJson(method, url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isGet = method.toUpperCase() === 'GET';
    let body = '';
    if (!isGet && data) {
      body = safeJsonStringify(data);
    }
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...getAuthHeaders(),
      },
      timeout: 60000,
    }, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(safeJsonParse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error('Invalid response JSON: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (!isGet) req.write(body);
    req.end();
  });
}

function requestForm(url, formData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    // 手动拼接查询字符串，不进行 URL 编码（OCR 接口要求原始 URL 格式）
    const queryPairs = [];
    for (const [k, v] of Object.entries(formData)) {
      if (v !== null && v !== undefined && v !== '') {
        queryPairs.push(`${k}=${v}`);
      }
    }
    const queryString = queryPairs.join('&');
    const pathWithQuery = urlObj.pathname + (urlObj.search || '') + (queryString ? (urlObj.search ? '&' : '?') + queryString : '');
    const fullUrl = urlObj.protocol + '//' + urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '') + pathWithQuery;
    console.error('[DEBUG] requestForm fullUrl:', fullUrl);
    console.error('[DEBUG] requestForm headers:', JSON.stringify({
      'Content-Type': 'application/x-www-form-urlencoded',
      ...getAuthHeaders(),
    }));
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: pathWithQuery,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...getAuthHeaders(),
      },
      timeout: 60000,
    }, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawResponse = Buffer.concat(chunks).toString();
        console.error('[DEBUG] requestForm rawResponse:', rawResponse.substring(0, 500));
        try {
          resolve(safeJsonParse(rawResponse));
        } catch (e) {
          reject(new Error('Invalid response JSON: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function parseDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function getExtensionFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
    'application/ofd': 'ofd',
  };
  return map[mimeType] || 'png';
}

function generateFileName(ext) {
  const ts = Date.now();
  return `invoice_${ts}.${ext}`;
}

async function uploadFile(fileName, base64Str) {
  const url = BASE_URL.replace(/\/+$/, '') + '/edo-resource/oss/putBase64File?type=invoice';
  console.error('[DEBUG] uploadFile URL:', url);
  return requestJson('POST', url, { fileName, base64Str });
}

async function ocrInvoice(imagePath, index) {
  const url = BASE_URL.replace(/\/+$/, '') + '/edo-resource/ocr/ocrInvoiceAndCheck';
  console.error('[DEBUG] ocrInvoice URL:', url);
  return requestForm(url, { imagePath, index });
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toEmptyStr(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

function toRelativePath(fullUrl) {
  if (!fullUrl) return '';
  // 去掉 http://221.224.251.134:9001/jinhong-ecs-bucket/ 前缀
  const match = fullUrl.match(/\/images\/(.+)$/);
  if (match) {
    return 'images/' + match[1];
  }
  return fullUrl;
}

function buildInvoicePoolPO(ocrInvoiceData) {
  const d = ocrInvoiceData;
  const items = (d.items || []).map(item => ({
    name: item.name || null,
    standard: item.standard || null,
    unit: item.unit || null,
    count: item.count !== undefined ? item.count : null,
    price: item.price !== undefined ? item.price : null,
    isTax: item.taxRate ? 1 : 0,
    taxRate: item.taxRate || null,
    noTaxAmount: item.noTaxAmount !== undefined ? item.noTaxAmount : null,
    taxMoney: item.taxMoney !== undefined ? item.taxMoney : null,
    totalAmount: item.totalAmount !== undefined ? item.totalAmount : null,
  }));

  // imgPath 使用相对路径，同时保留完整URL给 imgUrl/imgPathPreviewFull
  const imgPathFull = d.imgPath || '';
  const imgPathRelative = toRelativePath(imgPathFull);
  const imgPathPreviewFull = d.imgPathPreview || imgPathFull;
  const imgPathPreviewRelative = toRelativePath(imgPathPreviewFull);

  // invoiceDate 格式化为 yyyy-MM-dd 00:00:00
  let invoiceDate = d.invoiceDate || '';
  if (invoiceDate && invoiceDate.length === 10) {
    invoiceDate = invoiceDate + ' 00:00:00';
  }

  return {
    invoiceType: toEmptyStr(d.invoiceType),
    invoiceTypeName: toEmptyStr(d.invoiceTypeName),
    ocrType: toEmptyStr(d.ocrType),
    invoiceCode: toEmptyStr(d.invoiceCode),
    invoiceNumber: toEmptyStr(d.invoiceNumber),
    invoiceDate: invoiceDate,
    checkCode: toEmptyStr(d.checkCode),
    totalAmount: parseNumber(d.totalAmount),
    invoiceAmount: toEmptyStr(d.invoiceAmount),
    taxRate: parseNumber(d.taxRate),
    taxMoney: toEmptyStr(d.taxMoney),
    deductionTaxMoney: parseNumber(d.deductionTaxMoney),
    consumeKindCheck: toEmptyStr(d.consumeKindCheck) || '无特殊标记',
    isElectronic: toEmptyStr(d.isElectronic),
    purchaserName: toEmptyStr(d.purchaserName),
    purchaseTaxNumber: toEmptyStr(d.purchaseTaxNumber),
    purchaseAddress: toEmptyStr(d.purchaseAddress),
    purchaseBankAccount: toEmptyStr(d.purchaseBankAccount),
    sellerName: toEmptyStr(d.sellerName),
    sellerTaxNumber: toEmptyStr(d.sellerTaxNumber),
    sellerAddress: toEmptyStr(d.sellerAddress),
    sellerBankAccount: toEmptyStr(d.sellerBankAccount),
    position: toEmptyStr(d.position),
    machineNumber: '',
    invoiceArea: toEmptyStr(d.invoiceArea),
    imgPath: imgPathRelative,
    imgPathPreview: imgPathPreviewRelative,
    imgUrl: imgPathFull,
    imgPathPreviewFull: imgPathPreviewFull,
    note: toEmptyStr(d.note),
    passenger: toEmptyStr(d.passenger),
    idCard: toEmptyStr(d.idCard),
    fare: toEmptyStr(d.fare),
    civilAviationFund: toEmptyStr(d.civilAviationFund),
    fuelSurcharge: toEmptyStr(d.fuelSurcharge),
    otherTaxes: toEmptyStr(d.otherTaxes),
    insurance: toEmptyStr(d.insurance),
    einvoiceMark: toEmptyStr(d.einvoiceMark),
    refundContent: toEmptyStr(d.refundContent),
    fromPlace: toEmptyStr(d.fromPlace),
    endPlace: toEmptyStr(d.endPlace),
    carFromTime: toEmptyStr(d.carFromTime),
    trainNumber: toEmptyStr(d.trainNumber),
    seatNumber: toEmptyStr(d.seatNumber),
    seatType: toEmptyStr(d.seatType),
    ticketNumber: toEmptyStr(d.ticketNumber),
    carNumber: toEmptyStr(d.carNumber),
    boardingTime: toEmptyStr(d.boardingTime),
    landingTime: toEmptyStr(d.landingTime),
    mileage: toEmptyStr(d.mileage),
    source: '0',
    invoicePurpose: toEmptyStr(d.invoicePurpose) || 'jt',
    checkCategory: toEmptyStr(d.checkCategory),
    deductType: toEmptyStr(d.deductType) || 'A',
    deductMethod: toEmptyStr(d.deductMethod) || '2',
    items: items.length > 0 ? items : [],
    itemVOS: [],
    index: -1,
  };
}

async function saveInvoice(poolPO) {
  const url = BASE_URL.replace(/\/+$/, '') + '/edo-resource/invoice/addInvoicePool';
  console.error('[DEBUG] saveInvoice URL:', url);
  console.error('[DEBUG] saveInvoice request body:', JSON.stringify(poolPO, null, 2).substring(0, 2000));
  const result = await requestJson('POST', url, poolPO);
  console.error('[DEBUG] saveInvoice response:', JSON.stringify(result).substring(0, 500));
  return result;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(JSON.stringify({
      error: 'Usage: invoice-ocr.js \'{ "image": "data:image/png;base64,...", "fileName": "optional.png", "index": 1 }\'',
      code: 400
    }));
    process.exit(1);
  }

  let args;
  try { args = safeJsonParse(input); } catch (e) {
    console.error(JSON.stringify({ error: 'Invalid JSON: ' + e.message, code: 400 }));
    process.exit(1);
  }

  const imageDataUri = args.image;
  if (!imageDataUri) {
    console.error(JSON.stringify({ error: 'Missing required field: image', code: 400 }));
    process.exit(1);
  }

  const parsed = parseDataUri(imageDataUri);
  if (!parsed) {
    console.error(JSON.stringify({ error: 'Invalid image data URI format', code: 400 }));
    process.exit(1);
  }

  const ext = getExtensionFromMime(parsed.mimeType);
  const fileName = args.fileName || generateFileName(ext);
  const index = args.index || 1;

  const result = {
    success: false,
    code: 500,
    msg: '',
    data: {
      fileName,
      mimeType: parsed.mimeType,
      uploadResult: null,
      ocrResult: null,
      invoices: [],
    }
  };

  try {
    const uploadRes = await uploadFile(fileName, parsed.base64);
    result.data.uploadResult = uploadRes;

    if (!uploadRes.success || uploadRes.code !== 200 || !uploadRes.data || !uploadRes.data.fileUrl) {
      result.code = uploadRes.code || 500;
      result.msg = uploadRes.msg || '文件上传失败';
      console.log(safeJsonStringify(result));
      process.exit(1);
    }

    let fileUrl = uploadRes.data.fileUrl;
    // 去掉 URL 中的查询参数（AWS S3 签名等），OCR 接口只需要纯净的文件路径
    const queryIndex = fileUrl.indexOf('?');
    if (queryIndex !== -1) {
      fileUrl = fileUrl.substring(0, queryIndex);
    }
    console.error('[DEBUG] fileUrl after removing query:', fileUrl);

    const ocrRes = await ocrInvoice(fileUrl, index);
    result.data.ocrResult = ocrRes;

    if (!ocrRes.success || ocrRes.code !== 200) {
      result.code = ocrRes.code || 500;
      result.msg = ocrRes.msg || 'OCR识别失败';
      console.log(safeJsonStringify(result));
      process.exit(1);
    }

    const invoiceList = ocrRes.data || [];
    if (invoiceList.length === 0) {
      result.code = 200;
      result.success = true;
      result.msg = '文件上传成功，但未识别到发票信息';
      console.log(safeJsonStringify(result));
      process.exit(0);
    }

    const savedInvoices = [];
    for (let i = 0; i < invoiceList.length; i++) {
      const inv = invoiceList[i];
      const poolPO = buildInvoicePoolPO(inv);
      try {
        const saveRes = await saveInvoice(poolPO);
        savedInvoices.push({
          index: i,
          invoiceType: inv.invoiceType,
          invoiceTypeName: inv.invoiceTypeName,
          invoiceCode: inv.invoiceCode,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          totalAmount: inv.totalAmount,
          saveResult: saveRes,
          success: saveRes.success && saveRes.code === 200,
        });
      } catch (err) {
        savedInvoices.push({
          index: i,
          invoiceType: inv.invoiceType,
          invoiceTypeName: inv.invoiceTypeName,
          invoiceCode: inv.invoiceCode,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          totalAmount: inv.totalAmount,
          saveResult: { code: 500, success: false, msg: err.message },
          success: false,
        });
      }
    }

    result.data.invoices = savedInvoices;
    const allSuccess = savedInvoices.every(s => s.success);
    const anySuccess = savedInvoices.some(s => s.success);

    if (allSuccess) {
      result.code = 200;
      result.success = true;
      result.msg = `成功识别并保存 ${savedInvoices.length} 张发票`;
    } else if (anySuccess) {
      result.code = 200;
      result.success = true;
      const failCount = savedInvoices.filter(s => !s.success).length;
      result.msg = `部分成功：${savedInvoices.length - failCount} 张发票保存成功，${failCount} 张失败`;
    } else {
      result.code = 500;
      result.msg = '发票保存失败';
    }

    console.log(safeJsonStringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    result.code = 500;
    result.msg = err.message || '系统异常';
    console.log(safeJsonStringify(result));
    process.exit(1);
  }
}

main();
