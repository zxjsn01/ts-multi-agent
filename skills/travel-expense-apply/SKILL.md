---
name: travel-expense-apply
description: 帮助用户创建差旅费用申请单、处理附件发票识别或跳转至对应单据页面。支持快速模式、引导模式、跳转模式、附件发票识别模式四种交互方式。当用户提到"差旅申请"、"出差申请"、"费用申请"、"跳转/打开/查看单据"或上传PDF/OFD/JPG/PNG等附件时触发。
metadata:
  systemName: 差旅系统
  systemCode: fssc
  keywords:
    - 差旅申请
    - 出差费用
    - 差旅费用申请
    - 填出差单
    - 出差申请
    - travel apply
    - 跳转
    - 打开
    - 查看
    - 单据
    - 申请单
    - 报销单
    - 借款单
    - 付款单
    - 发票
    - 上传
    - PDF
    - OFD
    - JPG
    - PNG
    - 识别发票
    - 票夹
allowedTools:
  - bash
  - read
  - glob
  - grep
  - conversation-get
---

# 差旅费用申请单

帮助用户创建差旅费用申请单、处理附件发票识别或跳转至对应单据页面，支持四种交互模式：
- **快速模式**：用户一次性提供关键信息，系统智能解析并预测默认值，生成确认清单
- **引导模式**：系统一步步引导用户填写各个字段
- **跳转模式**：根据用户输入匹配单据类型，返回跳转参数供前端跳转至对应单据页面
- **附件发票识别模式**：用户上传PDF、OFD、JPG、PNG等附件，系统自动上传、OCR识别、保存发票到票夹，并询问是否跳转报销单

## 交互模式选择与智能识别

### 智能模式识别

**当用户触发技能时**，系统会智能分析用户输入：

1. **如果用户上传了附件**（「已获取参数」中包含 `image` 字段，且值为 Base64 编码的数据URI），自动进入附件发票识别模式
2. **如果用户直接提供出差信息**（包含时间、地点、金额、部门等关键信息），自动进入快速模式
3. **如果用户输入包含"查看"、"打开"、"跳转"、"我的单据"等关键词**，自动进入跳转模式
4. **如果用户只说"申请差旅"等通用请求**，则询问用户选择模式

### 模式选择提示

当需要询问用户时，使用以下提示：

```
您好！我可以帮您申请差旅费用或处理发票。您可以选择：

1. 快速模式（推荐）：直接告诉我出差相关信息，比如"下周三去上海出差，3000元，财务科"
2. 引导模式：我一步步引导您填写每个字段
3. 跳转模式：告诉我您想查看或跳转的单据，比如"查看我的差旅申请单"、"打开报销单"
4. 附件发票识别：上传PDF、OFD、JPG、PNG等格式的发票附件，我将自动识别并保存到您的票夹

请告诉我您想选择哪种模式？
```

### 快速模式智能识别规则

**自动进入快速模式的条件**：用户输入中包含以下信息中的至少3项：
- 出差时间（如"下周三"、"4月20日"、"5.1到5.3"）
- 出差地点（如"上海"、"北京"、"广州"）
- 申请金额（如"3000元"、"5000块"、"2000美元"、"1000"）
- 预算部门（如"财务科"、"信息部"、"研发部"）
- 业务描述（如"去洽谈业务"、"参加培训"、"开会"、"出差申请单"、"差旅申请单"、"差旅费用申请单"）

**示例**：
- ✅ 用户上传附件（「已获取参数」中image字段包含Base64数据） → 自动进入附件发票识别模式
- ✅ "下周三去上海出差，3000元，财务科" → 自动进入快速模式
- ✅ "4月20日到北京，5000元，信息部，参加培训" → 自动进入快速模式
- ✅ "查看我的差旅申请单" → 自动进入跳转模式
- ✅ "打开报销单" → 自动进入跳转模式
- ❌ "帮我申请差旅" → 询问模式选择
- ❌ "我要申请出差" → 询问模式选择

## ⚠️ 关键规则（必须遵守）

1. **接口返回的是列表，每个元素包含 `id`、`code`、`name` 等字段。下游接口需要的是 `id` 字段，绝对不能使用 `code` 或 `name`**
2. **用户选择后，必须从接口返回数据中提取完整的 id/code/name 三元组，不能只记 name 忘记 id**
3. **提交时所有字段都必须有值，不能省略任何字段**
4. **⚠️ 展示选择列表时，必须把每个选项的 id 一并展示**（见下方「列表展示格式」），因为任务可能会暂停等待用户回复，恢复后需要从询问历史中获取 id，如果列表中没有 id，将无法继续执行
5. **⚠️ 接口返回什么就是什么，禁止自行修改参数重试**：脚本调用接口返回的结果（包括空数据、错误码）就是最终结果，不要因为返回为空或不符合预期就换参数重新调用。如果数据为空或报错，直接如实告知用户即可。**违反此规则会导致无限循环和任务超时**
6. **⚠️ 差旅申请单保存流程只能使用 `api-call.js` 和 `submit-travel-apply.js` 脚本调用接口**；附件发票识别流程使用 `invoice-ocr.js` 脚本。禁止使用 curl、wget 或其他方式调用接口。禁止读取脚本源码、禁止查看文件目录来调试接口问题
7. **⚠️ 接口调用失败时（如返回 404、500 等），立即告知用户"系统接口异常，请稍后重试"，不要尝试自行排查或修复**

## 快速模式实现

### 1. 智能解析用户输入

**步骤1：智能模式识别**
- 分析用户输入，判断是否包含足够的出差信息
- 如果用户输入包含至少3项关键信息，自动进入快速模式
- 如果用户明确选择"1"或"快速模式"，进入快速模式

**步骤2：解析 userId**
- 从用户输入中提取 userId
- 从对话历史中获取 userId
- 如果都没有，询问用户

**步骤3：提取关键信息**
从用户自然语言输入中提取以下信息：
- 出差时间（travelStartDate, travelEndDate）
- 出差地点（城市名）
- 申请金额（originalCoin）
- 预算部门（costOrgName）
- 法人公司（enterpriseName）
- 成本中心（costCenterName）
- 费用项目（costName）
- 业务描述（remark）
- 出差范围（travelRange）

**步骤4：调用接口获取可选列表**
- 调用 searchApplyUserListNew 获取申请人列表
- 调用 searchCostOrganizationByUserId 获取预算部门列表
- 调用 searchEnterpriseByOrgId 获取法人公司列表
- 调用 searchCostCenterListByEnterpriseIdAndOrgId 获取成本中心列表
- 调用 searchCostItemByOrgAndResourcePage 获取费用项目列表
- 调用 searchCurrencyList 获取币种列表
- 调用 seachAreasList 获取地点列表（如果用户提到城市）

**步骤5：智能匹配和预测**
- 对提取的信息与接口返回的列表进行匹配
- 对于未提供的字段，使用智能预测：
  - 申请人：默认选择列表的第一个
  - 预算部门：默认选择列表的第一个
  - 法人公司：默认选择列表的第一个
  - 成本中心：默认选择列表的第一个
  - 费用项目：默认选择列表的第一个
  - 币种：默认选择人民币
  - 出差范围：默认选择国内

**步骤6：生成确认清单**
生成一个简洁的确认清单，展示所有预测和匹配的字段值：

```
请确认以下信息是否正确：

1. 申请人：张三 (id:1727596139882397698)
2. 预算部门：财务科 (id:1727507556643364900)
3. 法人公司：金宏集团 (id:1730125261242494978)
4. 成本中心：研发中心 (id:123456789)
5. 费用项目：差旅费 (id:987654321)
6. 币种：人民币 (id:1)
7. 出差地点：上海
8. 出差时间：2026-04-21 至 2026-04-23
9. 申请金额：3000 元
10. 业务描述：去上海洽谈业务
11. 出差范围：国内

以上信息是否正确？如果有需要修改的地方，请告诉我具体修改内容。
```

**步骤7：用户确认**
- 如果用户确认正确，直接调用保存接口
- 如果用户需要修改，重新解析修改内容并更新字段值
- 重复确认流程直到用户确认无误

## 跳转模式实现

### 触发条件

当用户输入包含以下关键词时，自动进入跳转模式：
- "查看"、"打开"、"跳转"、"进入"
- "我的单据"、"我的申请"、"我的报销"
- "单据"、"申请单"、"报销单" + "列表/详情/页面"

### 执行流程

**步骤1：解析用户意图**
从用户输入中提取以下信息：
- **单据类型关键词**：如"差旅申请"、"报销"、"借款"、"付款"等
- **单号**（可选）：如"SQ202604300001"
- **时间范围**（可选）：如"最近一周"、"本月"、"4月份"
- **状态**（可选）：如"待审批"、"已驳回"、"已完成"

**步骤2：匹配单据类型**
根据提取的关键词，匹配系统中可用的单据类型：

| 关键词 | orderTypeCode | orderTypeName |
|--------|--------------|---------------|
| 职工费用报账、日常 | bxyb | 职工费用报账 |
| 日常费用报账、日常 | bxybks | 日常费用报账 |
| 差旅费用报账、出差报销、差旅报销 | bxcl | 差旅费用报账 |
| 无申请差旅费用报账、出差报销、差旅报销 | bxclks | 无申请差旅费用报账 |
| 员工还款、还款 | hk | 员工还款 |
| 借款、员工借款 | jkks | 员工借款 |
| 差旅费用申请、出差申请、差旅申请 | sqcl | 差旅费用申请 |
| 付款申请 | fksq | 付款申请 |
| 采购付款报账 | fkbz | 采购付款报账 |
| 应付扣款申请 | kk | 应付扣款申请 |
| 业务招待申请、业务、业务招待 | sqyw | 业务招待申请 |
| 业务招待报账、业务、业务招待 | bxyw | 业务招待报账 |
| 特殊费用报账 | bxtsks | 特殊费用报账 |
| 押金付款单 | fkyj | 押金付款单 |
| 保证金付款 | bzjfk | 保证金付款 |
| 职工费用申请 | sqyb | 职工费用申请 |
| 无申请业务招待报账 | bxywks | 无申请业务招待报账 |
| 手工做账 | sgzz | 手工做账 |
| 资金划拨单 | fkzj | 资金划拨单 |
| 期初付款单 | fkqc | 期初付款单 |
| 无申请对公费用报账 | bxybkstg | 无申请对公费用报账 |
| 对公费用报账 | bxybtg | 对公费用报账 |

**步骤3：构建响应文本**

跳转模式直接在 **message 文本** 中嵌入可点击的单据类型标记，格式为 `##orderTypeCode##`。

前端通过正则表达式 `##([a-z]+)##` 匹配并替换成跳转按钮。

**返回格式：表格模式**
返回 Markdown 表格形式，包含单据类型编码和描述：

```
已为您匹配到以下单据类型，您可以点击跳转到对应页面：

| 单据类型 | 描述 |
|---------|------|
| ##sqcl## | 差旅费用申请是员工因公出差前，向公司申请预支差旅费用的标准化单据 |
| ##bxcl## | 差旅费用报账是员工用于申报因公出差产生的交通、住宿、餐饮等费用，并申请公司财务报销的标准化单据 |
| ##jkks## | 员工借款是员工因公务需要向公司申请借款的标准化单据 |
```

**标记规则**：
- 每个匹配到的单据类型用 `##编码##` 包裹
- 编码使用 `orderTypeCode`（如 `sqcl`、`bxcl`、`jk`、`fk`）
- 标记直接嵌入在文本中，不需要额外的结构化数据字段
- **返回 Markdown 表格**，包含 `##编码##` 和描述文本，前端提取编码渲染按钮，同时展示描述

**步骤4：前端处理逻辑**
前端接收到响应后：
1. 在 `message` 文本中搜索正则表达式 `##([a-z]+)##`
2. 将匹配到的标记替换为对应的跳转按钮
3. 按钮文案根据编码映射为中文名称（如 `sqcl` → "差旅费用申请"）
4. 用户点击按钮后，前端根据编码自主路由跳转到对应页面

**编码映射表（前端参考）**：

| 标记编码 | 单据类型名称 | 描述 |
|---------|------------|------|
| `bxyb` | 职工费用报账 | 职工费用报账是员工申报日常办公、福利等职工相关费用，申请公司财务报销的标准化单据 |
| `bxybks` | 日常费用报账 | 日常费用报账是员工申报日常办公、行政等常规费用，申请公司财务报销的标准化单据 |
| `bxcl` | 差旅费用报账 | 差旅费用报账是员工用于申报因公出差产生的交通、住宿、餐饮等费用，并申请公司财务报销的标准化单据 |
| `bxclks` | 无申请差旅费用报账 | 无申请差旅费用报账是员工在未提前申请的情况下，直接申报差旅费用并申请报销的标准化单据 |
| `hk` | 员工还款 | 员工还款是员工向公司归还之前借款或预支款项的标准化单据 |
| `jkks` | 员工借款 | 员工借款是员工因公务需要向公司申请借款的标准化单据 |
| `sqcl` | 差旅费用申请 | 差旅费用申请是员工因公出差前，向公司申请预支差旅费用的标准化单据 |
| `fksq` | 付款申请 | 付款申请是员工或部门向公司申请对外支付款项的标准化单据 |
| `fkbz` | 采购付款报账 | 采购付款报账是员工申报采购商品或服务费用，申请公司财务报销的标准化单据 |
| `kk` | 应付扣款申请 | 应付扣款申请是员工或部门申请从应付款项中扣除特定款项的标准化单据 |
| `sqyw` | 业务招待申请 | 业务招待申请是员工因业务需要招待客户或合作伙伴前，向公司申请预支招待费用的标准化单据 |
| `bxyw` | 业务招待报账 | 业务招待报账是员工申报业务招待产生的餐饮、礼品等费用，申请公司财务报销的标准化单据 |
| `bxtsks` | 特殊费用报账 | 特殊费用报账是员工申报不属于常规类别的特殊费用，申请公司财务报销的标准化单据 |
| `fkyj` | 押金付款单 | 押金付款单是员工或部门申请支付租房、设备等押金款项的标准化单据 |
| `bzjfk` | 保证金付款 | 保证金付款是员工或部门申请支付投标、履约等保证金款项的标准化单据 |
| `sqyb` | 职工费用申请 | 职工费用申请是员工预先申请日常办公、福利等职工相关费用的标准化单据 |
| `bxywks` | 无申请业务招待报账 | 无申请业务招待报账是员工在未提前申请的情况下，直接申报业务招待费用并申请报销的标准化单据 |
| `sgzz` | 手工做账 | 手工做账是财务人员用于手工录入和调整账务信息的标准化单据 |
| `fkzj` | 资金划拨单 | 资金划拨单是用于公司内部不同账户或部门之间划拨资金的标准化单据 |
| `fkqc` | 期初付款单 | 期初付款单是用于系统初始化时录入期初应付款项信息的标准化单据 |
| `bxybkstg` | 无申请对公费用报账 | 无申请对公费用报账是员工在未提前申请的情况下，直接申报对公业务费用并申请报销的标准化单据 |
| `bxybtg` | 对公费用报账 | 对公费用报账是员工申报对公业务产生的费用，申请公司财务报销的标准化单据 |

### 注意事项

1. **禁止在跳转模式下调用保存接口**，此模式仅用于页面跳转
2. **如果用户提供了具体单号**，应优先精确匹配该单号对应的数据
3. **标记格式必须严格遵循 `##编码##`**，不要添加额外说明文字在标记内部
4. **前端完全掌控路由逻辑**，后端仅提供标记，具体跳转到哪个页面由前端路由表决定
5. **示例对话**：
   - 用户："查看我的差旅申请单"
   - 助手："已为您匹配到以下单据类型，您可以点击跳转到对应页面：\n\n| 单据类型 | 描述 |\n|---------|------|\n| ##sqcl## | 差旅费用申请是员工因公出差前，向公司申请预支差旅费用的标准化单据 |"
   - 用户："我可以跳转哪些页面"
   - 助手："已为您匹配到以下单据类型，您可以点击跳转到对应页面：\n\n| 单据类型 | 描述 |\n|---------|------|\n| ##sqcl## | 差旅费用申请是员工因公出差前，向公司申请预支差旅费用的标准化单据 |\n| ##bxcl## | 差旅费用报账是员工用于申报因公出差产生的交通、住宿、餐饮等费用，并申请公司财务报销的标准化单据 |\n| ##jkks## | 员工借款是员工因公务需要向公司申请借款的标准化单据 |"

## 附件发票识别模式实现

### 触发条件

当用户在与智能体对话过程中上传附件时，系统通过 `/tasks/stream` 接口接收到的请求中会包含 `image` 字段，其值为 Base64 编码的数据 URI（格式如 `data:application/pdf;base64,JVBERi0xLjcKJeL...`）。

**自动触发条件**：「已获取参数」中存在 `image` 字段且值以 `data:` 开头。

### 执行流程

```
[步骤1] 解析 image 字段 → [步骤2] 上传文件到服务器 → [步骤3] OCR识别发票 → [步骤4] 保存发票到票夹 → [步骤5] 向用户展示识别结果 → [步骤6] 询问是否跳转报销单
```

---

### 步骤1：从「已获取参数」中获取 image 字段

「已获取参数」中会包含用户上传的附件 Base64 数据。从 `image` 参数中提取值，该值为带 `data:` 前缀的 Base64 数据 URI。脚本内部会自动解析 MIME 类型并去除前缀，无需额外处理。

**获取方式**：直接使用「已获取参数」中的 `image` 字段值作为脚本参数。

**支持的发票附件格式**：
| MIME 类型 | 扩展名 | 说明 |
|-----------|--------|------|
| `image/jpeg` | `.jpg` | JPEG 图片 |
| `image/jpg` | `.jpg` | JPG 图片 |
| `image/png` | `.png` | PNG 图片 |
| `application/pdf` | `.pdf` | PDF 文件 |
| `application/ofd` | `.ofd` | OFD 文件 |

---

### 步骤2：上传文件到服务器

调用 `invoice-ocr.js` 脚本，自动完成上传、OCR 识别和保存的完整流程。

**调用方式**：
```bash
node scripts/invoice-ocr.js '{"image":"data:application/pdf;base64,JVBERi0xLjcKJeL...","fileName":"optional.pdf","index":1}'
```

**参数说明**：
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `image` | String | 是 | 带 data 前缀的 Base64 数据 URI。如果「已获取参数」中有 image 字段，请直接将其值作为 image 参数传入，系统会自动处理完整数据 |
| `fileName` | String | 否 | 附件名称，不传则由脚本根据 MIME 类型自动生成 |
| `index` | Integer | 否 | 所属第几张纸质文件的序号，默认 1 |

**重要提示**：当「已获取参数」中存在 `image` 字段时，说明用户已上传附件。调用脚本时，请直接使用「已获取参数」中的 `image` 值作为 `image` 参数。即使 prompt 中显示的是截断的标记，实际执行时系统会自动注入完整数据。

**脚本内部执行逻辑**：
1. 解析 `image` 字段，提取 MIME 类型和纯 Base64 数据
2. 调用 `POST /putBase64File?type=invoice` 上传文件（`type=invoice`，文件存储至发票目录）
3. 上传成功后获取 `fileUrl`
4. 调用 `POST /ocr/ocrInvoiceAndCheck` 进行 OCR 识别和发票查验
5. 遍历识别结果，对每张发票调用 `POST /invoice/addInvoicePool` 保存到票夹
6. 返回汇总结果

---

### 步骤3：处理识别结果

脚本返回的 JSON 结构：

```json
{
  "success": true,
  "code": 200,
  "msg": "成功识别并保存 1 张发票",
  "data": {
    "fileName": "invoice_1715030400000.pdf",
    "mimeType": "application/pdf",
    "uploadResult": { "code": 200, "success": true, "data": { "fileUrl": "..." } },
    "ocrResult": { "code": 200, "success": true, "data": [...] },
    "invoices": [
      {
        "index": 0,
        "invoiceType": "vat_special_invoice",
        "invoiceTypeName": "增值税专用发票",
        "invoiceCode": "011002100311",
        "invoiceNumber": "23912077",
        "invoiceDate": "2026-04-15",
        "totalAmount": "9658.12",
        "saveResult": { "code": 200, "success": true, "data": 12345 },
        "success": true
      }
    ]
  }
}
```

**异常处理规则**：
- 上传失败：停止后续流程，告知用户"文件上传失败，请检查附件后重试"
- OCR 识别失败：停止后续流程，告知用户"发票识别失败，请确保上传的是清晰的发票图片"
- 未识别到发票：告知用户"文件上传成功，但未识别到发票信息，请检查附件内容"
- 部分保存失败：告知用户哪些发票保存成功、哪些失败及原因

---

### 步骤4：向用户展示识别结果

发票保存成功后，向用户展示识别到的发票信息：

```
✅ 发票识别成功！已保存到您的票夹。

📄 识别结果：
- 发票类型：增值税专用发票
- 发票代码：011002100311
- 发票号码：23912077
- 开票日期：2026-04-15
- 购买方：某某科技有限公司
- 销售方：某某商贸有限公司
- 价税合计：9658.12 元
- 税额：1111.11 元

（如识别出多张发票，依次列出）
```

---

### 步骤5：智能推荐跳转报销单

根据识别到的发票类型，智能判断并推荐跳转的单据类型：

**交通类发票优先推荐差旅报销**：
| 发票类型（invoiceType） | 发票类型名称 | 推荐跳转单据 |
|------------------------|-------------|-------------|
| `train_ticket` | 火车票 | ##bxcl## 差旅费用报账 |
| `train_ticket_no_passenger` | 火车票(无旅客) | ##bxcl## 差旅费用报账 |
| `air_transport` | 飞机行程单 | ##bxcl## 差旅费用报账 |
| `taxi_ticket` | 出租车票 | ##bxcl## 差旅费用报账 |
| `passenger_transport_invoice` | 客运发票 | ##bxcl## 差旅费用报账 |
| `passenger_shipping_invoice` | 船运客票 | ##bxcl## 差旅费用报账 |
| `vehicle_toll` | 通行费发票 | ##bxcl## 差旅费用报账 |

**其他类型发票展示常用报销类型**：

```
发票已保存成功！是否需要跳转到报销单页面进行报销？

根据您的发票类型，推荐以下单据：

| 单据类型 | 描述 |
|---------|------|
| ##bxybks## | 日常费用报账是员工申报日常办公、行政等常规费用，申请公司财务报销的标准化单据 |
| ##bxcl## | 差旅费用报账是员工用于申报因公出差产生的交通、住宿、餐饮等费用，并申请公司财务报销的标准化单据 |
| ##bxyw## | 业务招待报账是员工申报业务招待产生的餐饮、礼品等费用，申请公司财务报销的标准化单据 |
| ##bxybtg## | 对公费用报账是员工申报对公业务产生的费用，申请公司财务报销的标准化单据 |

您可以点击上方单据类型跳转，或回复"不需要"继续当前对话。
```

**如果是交通类发票（火车票、飞机行程单等）**：

```
检测到您上传的是交通类发票（火车票/飞机行程单），推荐跳转到差旅报销：

| 单据类型 | 描述 |
|---------|------|
| ##bxcl## | 差旅费用报账是员工用于申报因公出差产生的交通、住宿、餐饮等费用，并申请公司财务报销的标准化单据 |
| ##bxclks## | 无申请差旅费用报账是员工在未提前申请的情况下，直接申报差旅费用并申请报销的标准化单据 |

您可以点击上方单据类型跳转，或回复"不需要"继续当前对话。
```

**用户回复处理**：
- 用户点击跳转按钮或回复"跳转"：由前端根据 `##编码##` 标记自主路由跳转
- 用户回复"不需要"、"否"、"不用了"等：结束附件发票识别流程，返回正常对话
- 用户未明确回复：再次询问"是否需要跳转到报销单页面？"

---

### 注意事项

1. **Base64 格式**：`image` 字段必须包含 `data:` 前缀，脚本会自动解析 MIME 类型并截取纯 Base64 内容传递给上传接口
2. **文件名处理**：如未提供 `fileName`，脚本会根据 MIME 类型自动生成 `invoice_时间戳.扩展名`
3. **多张发票**：一张附件图片上可能识别出多张发票，脚本会逐张保存并返回每张的保存结果
4. **Token 认证**：脚本复用 `token-manager.js` 的认证逻辑，需确保 `SKILL_ACCESS_TOKEN` 环境变量已设置
5. **禁止在附件发票识别模式下调用差旅申请保存接口**：此模式仅用于发票识别和跳转推荐，不直接创建报销单

## 引导模式实现

引导模式保持原有的逐层引导逻辑，按以下层级执行：
[第0层] 获取 userId → [第1层] 获取申请人 → [第2层] 获取预算部门 → [第3层] 获取法人公司 → [第4层] 获取成本中心 → [第5层] 获取费用项目 → [第6层] 获取币种/地点/同行人 → [第7层] 获取用户输入 → [提交]

## 列表展示格式（必须遵守）

当接口返回多条数据需要让用户选择时，**必须**按以下格式展示，把 `id` 包含在括号中：

```
请选择预算部门：
1. 财务科 (id:1727507556643364900)
2. 信息部 (id:1727507556643364866)
```

**注意**：
- 编号用 `1. 2. 3.` 格式
- 名称后面必须跟 `(id:具体id值)`
- 如果接口返回了 code，也一并展示：`1. 财务科 (id:xxx, code:JH3002)`
- **禁止只展示名称不展示 id**

## 字段映射速查表

> 以下表格展示了每个提交字段需要从哪个接口的哪个返回字段取值。**在调用接口和用户选择时，务必对照此表。**

| 提交字段 | 取值来源接口 | 取值来源字段 |
|---------|------------|------------|
| applyBy | searchApplyUserListNew | `data[].id` |
| applyCode | searchApplyUserListNew | `data[].userCode` |
| applyName | searchApplyUserListNew | `data[].nickName` |
| applyOrgId | searchApplyUserListNew | `data[].orgId` |
| applyOrgCode | searchApplyUserListNew | `data[].orgCode` |
| applyOrgName | searchApplyUserListNew | `data[].orgName` |
| costOrgId | searchCostOrganizationByUserId | `data[].id` |
| costOrgCode | searchCostOrganizationByUserId | `data[].orgCode` |
| costOrgName | searchCostOrganizationByUserId | `data[].orgName` |
| enterpriseId | searchEnterpriseByOrgId | `data[].id` |
| enterpriseCode | searchEnterpriseByOrgId | `data[].enterpriseCode` |
| enterpriseName | searchEnterpriseByOrgId | `data[].enterpriseName` |
| costCenterId | searchCostCenterListByEnterpriseIdAndOrgId | `data[].id` |
| costCenterCode | searchCostCenterListByEnterpriseIdAndOrgId | `data[].costCenterCode` |
| costCenterName | searchCostCenterListByEnterpriseIdAndOrgId | `data[].costCenterName` |
| costId | searchCostItemByOrgAndResourcePage | `data.records[].costId` |
| costCode | searchCostItemByOrgAndResourcePage | `data.records[].costCode` |
| costName | searchCostItemByOrgAndResourcePage | `data.records[].costName` |
| currencyId | searchCurrencyList | `data[].id` |
| currencyCode | searchCurrencyList | `data[].currencyCode` |
| currencyName | searchCurrencyList | `data[].currencyName` |

## 执行流程

```
[第0层] 获取 userId → [第1层] 获取申请人 → [第2层] 获取预算部门 → [第3层] 获取法人公司 → [第4层] 获取成本中心 → [第5层] 获取费用项目 → [第6层] 获取币种/地点/同行人 → [第7层] 获取用户输入 → [提交]
```

---

### 第0层：获取 userId

**检查顺序**：
1. 检查「已获取参数」部分
2. 检查「询问历史」部分
3. 如果都没有，询问用户

---

### 第1层：获取申请人（依赖 userId）

**步骤1：检查已有信息**
- 检查「已获取参数」中是否有
- 检查「询问历史」中用户是否已回复过相关选择
- 如果都已获取 → 直接记录字段值，跳到第2层

**步骤2：调用接口获取列表**
使用 bash 工具执行以下命令：
```bash
# 查询申请人列表（返回 data[].id, userCode, nickName, orgId, orgCode, orgName）
node scripts/api-call.js '{"method":"POST","path":"/edo-base/user/searchApplyUserListNew","params":{"userId":"<userId>","orderTypeCode":"sqcl"}}'
```

**步骤3：用户选择**
- 如果只有一条数据 → 自动选择，**记录该条数据的 id/code/name**，无需询问
- 如果有多条数据 → 按「列表展示格式」展示列表让用户选择（必须包含 id）
- 如果接口返回空数据（records 为空） → **告知用户该成本中心下暂无费用项目配置，请用户手动提供费用项目的 id/code/name**，绝对不能使用 "0" 或其他伪造的 id
- 用户选择后，**从询问历史中的列表文本解析出对应项的 id/code/name**

**步骤4：记录字段值**
用户选择申请人后，立即记录以下 6 个字段：
- `applyBy` = 所选项的 `id`
- `applyCode` = 所选项的 `userCode`
- `applyName` = 所选项的 `nickName`
- `applyOrgId` = 所选项的 `orgId`
- `applyOrgCode` = 所选项的 `orgCode`
- `applyOrgName` = 所选项的 `orgName`

---

### 第2层：获取预算部门（依赖 userId）

**步骤1：检查已有信息**
- 检查「已获取参数」中是否有
- 检查「询问历史」中用户是否已回复过相关选择
- 如果都已获取 → 直接记录字段值，跳到第3层

**步骤2：调用接口获取列表**
使用 bash 工具执行以下命令：
```bash
# 查询预算占用部门列表（返回 data[].id, orgCode, orgName）
node scripts/api-call.js '{"method":"POST","path":"/edo-base/userOrgCost/searchCostOrganizationByUserId","params":{"userId":"<userId>","isFinal":"1"}}'
```

**步骤3：用户选择**
- 如果只有一条数据 → 自动选择，**记录该条数据的 id/code/name**，无需询问
- 如果有多条数据 → 按「列表展示格式」展示列表让用户选择（必须包含 id）
- 用户选择后，**从询问历史中的列表文本解析出对应项的 id/code/name**

**步骤4：记录字段值**
用户选择预算部门后，立即记录以下 3 个字段：
- `costOrgId` = 所选项的 `id`  ⚠️ **注意：是 id，不是 orgCode**
- `costOrgCode` = 所选项的 `orgCode`
- `costOrgName` = 所选项的 `orgName`

---

### 第3层：获取法人公司（依赖 costOrgId）

> ⚠️ **本层接口需要 `costOrgId`（预算部门的 id），不是 orgCode，不是 orgName**

**步骤1：检查已有信息**
- 检查「已获取参数」中是否有
- 检查「询问历史」中用户是否已回复过相关选择
- 如果都已获取 → 直接记录字段值，跳到第4层

**步骤2：调用接口获取列表**
使用 bash 工具执行以下命令：
```bash
# 查询法人公司列表（返回 data[].id, enterpriseCode, enterpriseName）
node scripts/api-call.js '{"method":"POST","path":"/edo-base/enterpriseOrg/searchEnterpriseByOrgId","params":{"orgId":"<costOrgId>"}}'
```

**步骤3：用户选择**
- 如果只有一条数据 → 自动选择，**记录该条数据的 id/code/name**，无需询问
- 如果有多条数据 → 按「列表展示格式」展示列表让用户选择（必须包含 id）
- 用户选择后，**从询问历史中的列表文本解析出对应项的 id/code/name**

**步骤4：记录字段值**
用户选择法人公司后，立即记录以下 3 个字段：
- `enterpriseId` = 所选项的 `id`  ⚠️ **注意：是 id，不是 enterpriseCode**
- `enterpriseCode` = 所选项的 `enterpriseCode`
- `enterpriseName` = 所选项的 `enterpriseName`

---

### 第4层：获取成本中心（依赖 costOrgId 和 enterpriseId）

> ⚠️ **本层接口需要 `costOrgId`（预算部门的 id）和 `enterpriseId`（法人公司的 id）**

**步骤1：检查已有信息**
- 检查「已获取参数」中是否有
- 检查「询问历史」中用户是否已回复过相关选择
- 如果都已获取 → 直接记录字段值，跳到第5层

**步骤2：调用接口获取列表**
使用 bash 工具执行以下命令：
```bash
# 查询成本中心列表（返回 data[].id, costCenterCode, costCenterName）
node scripts/api-call.js '{"method":"POST","path":"/edo-base/costCenter/searchCostCenterListByEnterpriseIdAndOrgId","params":{"enterpriseId":"<enterpriseId>","orgId":"<costOrgId>"}}'
```

**步骤3：用户选择**
- 如果只有一条数据 → 自动选择，**记录该条数据的 id/code/name**，无需询问
- 如果有多条数据 → 按「列表展示格式」展示列表让用户选择（必须包含 id）
- 用户选择后，**从询问历史中的列表文本解析出对应项的 id/code/name**

**步骤4：记录字段值**
用户选择成本中心后，立即记录以下 3 个字段：
- `costCenterId` = 所选项的 `id`  ⚠️ **注意：是 id，不是 costCenterCode**
- `costCenterCode` = 所选项的 `costCenterCode`
- `costCenterName` = 所选项的 `costCenterName`

---

### 第5层：获取费用项目（依赖 costCenterId）

> ⚠️ **本层接口需要 `costCenterId`（成本中心的 id）**

**步骤1：检查已有信息**
- 检查「已获取参数」中是否有
- 检查「询问历史」中用户是否已回复过相关选择
- 如果都已获取 → 直接记录字段值，跳到第6层

**步骤2：调用接口获取列表**
使用 bash 工具执行以下命令：
```bash
# 查询费用项目列表（返回 data[].id, costCode, costName）
# ⚠️ 此接口参数必须放在 params 中
node scripts/api-call.js '{"method":"POST","path":"/edo-base/resourceCostDetail/searchCostItemByOrgAndResourcePage","params":{"resourceCode":"sqcl","orgId":"<costCenterId>","current":1,"size":10},"body":{}}'
```

**步骤3：用户选择**
- 如果只有一条数据 → 自动选择，**记录该条数据的 id/code/name**，无需询问
- 如果有多条数据 → 按「列表展示格式」展示列表让用户选择（必须包含 id）
- 用户选择后，**从询问历史中的列表文本解析出对应项的 id/code/name**

**步骤4：记录字段值**
用户选择费用项目后，立即记录以下 3 个字段：
- `costId` = 所选项的 `id`  ⚠️ **注意：是 id，不是 costCode**
- `costCode` = 所选项的 `costCode`
- `costName` = 所选项的 `costName`

---

### 第6层：获取币种、地点、同行人（独立数据源）

**币种**：

使用 bash 工具执行以下命令：
```bash
# 查询币种列表（返回 data[].id, currencyCode, currencyName）
node scripts/api-call.js '{"method":"POST","path":"/edo-base/currency/searchCurrencyList","params":{}}'
```

选择后记录：
- `currencyId` = 所选项的 `id`
- `currencyCode` = 所选项的 `currencyCode`
- `currencyName` = 所选项的 `currencyName`

**出差地点**（用户输入城市名）：

使用 bash 工具执行以下命令：
```bash
# ⚠️ 此接口参数必须放在 body 中
node scripts/api-call.js '{"method":"POST","path":"/edo-base/areas/seachAreasList","body":{"levelType":2,"name":"<城市名>"}}'
```

选择后记录到 `areas` 数组：
- `areasCode` = 所选项的 `areasCode`
- `areasName` = 所选项的 `areasName`

**同行人员**（可选，默认申请人为同行人员，用户可输入姓名选择其他同行人）：

使用 bash 工具执行以下命令：
```bash
# ⚠️ 此接口参数必须放在 body 中
node scripts/api-call.js '{"method":"POST","path":"/edo-base/user/searchUserList","body":{"nickName":"<姓名>"}}'
```

选择后记录到 `associates` 数组：
- `associateBy` = 所选项的 `id`
- `associateName` = 所选项的 `nickName`

---

### 第7层：获取用户输入

直接从用户输入中提取：
- **申请金额** (originalCoin)：数字提取，如 "3000块" → 3000
- **业务描述** (remark)：直接提取
- **出差时间** (travelStartDate, travelEndDate)：解析日期，如 "4月20日到22日" → 2026-04-20 ~ 2026-04-22
- **出差范围** (travelRange)："国内"→3, "国际"→4, "港澳台"→5。**如果用户未指定，默认为"国内"(3)，无需询问**

---

### 提交申请单

**提交前校验**：确认以下所有字段都已收集完毕，如有缺失则返回对应层级获取。

**调用保存接口**：
使用 bash 工具执行以下命令：
```bash
node scripts/submit-travel-apply.js '{
  "applyBy": <Long>,
  "applyCode": "<String>",
  "applyName": "<String>",
  "applyOrgId": <Long>,
  "applyOrgCode": "<String>",
  "applyOrgName": "<String>",
  "costOrgId": <Long>,
  "costOrgCode": "<String>",
  "costOrgName": "<String>",
  "enterpriseId": <Long>,
  "enterpriseCode": "<String>",
  "enterpriseName": "<String>",
  "costCenterId": <Long>,
  "costCenterCode": "<String>",
  "costCenterName": "<String>",
  "costId": <Long>,
  "costCode": "<String>",
  "costName": "<String>",
  "currencyId": <Long>,
  "currencyCode": "<String>",
  "currencyName": "<String>",
  "originalCoin": <Number>,
  "remark": "<String>",
  "travelStartDate": "yyyy-MM-dd",
  "travelEndDate": "yyyy-MM-dd",
  "travelRange": <Integer>,
  "areas": [{"code": "<areasCode>", "name": "<areasName>"}],
  "associates": [{"id": <associateBy>, "name": "<associateName>"}]
}'
```

## 提交结果解析

提交脚本 `submit-travel-apply.js` 在保存成功后会自动调用详情接口，返回的 JSON 中包含以下关键字段：

| 字段 | 含义                         | 用途 |
|------|----------------------------|------|
| `data` | 保存接口返回的记录 ID（数据库主键）        | ⚠️ **这不是申请单号，不要展示为"申请单号"** |
| `applyNumber` | 业务申请单号（如 `SQ202404290001`） | ✅ **这才是真正的申请单号，展示给用户** |
| `approvalStatusName` | 审批状态描述（如"待提交"）             | 可选展示 |

### 展示格式

提交成功后，按以下格式展示结果：

```
✅ 差旅申请已成功提交！

📋 基本信息
- 申请单号：{applyNumber}
- 单据类型：{orderTypeName}
- 申请人：{applyName}（{applyOrgName}）
- 申请时间：{applyDate}
- 审批状态：{approvalStatusName}

🏢 组织信息
- 预算部门：{costOrgName}
- 法人公司：{enterpriseName}
- 成本中心：{costCenterName}
- 费用项目：{costName}

💰 费用信息
- 申请金额：{localCurrency} 元（{currencyName}）

✈️ 出差信息
- 出差地点：{出差地点}
- 出差时间：{travelStartDate} 至 {travelEndDate}
- 出差范围：{travelRangeName}
- 业务描述：{remark}
```

### ⚠️ 常见错误

- ❌ 把 `data`（如 `2049390833540038657`）当作申请单号展示
- ✅ 使用 `applyNumber`（如 `AP202404290001`）作为申请单号
- 如果 `applyNumber` 为空（详情接口调用失败），则展示"申请单号获取失败，请稍后在系统中查看"，**绝对不要用 `data` 的值代替**

## 执行规则

1. **按层级顺序执行**：必须先完成第N层，才能执行第N+1层
2. **优先使用已有信息**：每层开始前，先检查「已获取参数」和「询问历史」
3. **用户选择后立即记录完整字段**：不要只记 name，必须同时记录 id 和 code
4. **下游接口只用 id**：传给接口的参数永远是 `id` 字段（如 costOrgId、orgId），不是 code 也不是 name
5. **多条数据让用户选择时，必须按「列表展示格式」展示**：每个选项必须包含 id，方便恢复任务时从询问历史中解析
6. **只有一条数据时自动选择**：不要让用户做无意义的选择，直接使用唯一选项
7. **用户可一次性提供多个信息**：解析用户输入，提取所有可用信息，跳过已获取的字段层级
8. **附件发票识别流程独立执行**：当检测到 `image` 字段时，直接调用 `invoice-ocr.js` 脚本完成上传→OCR→保存的完整流程，不与其他模式混用
9. **发票识别后的跳转推荐仅展示不强制**：向用户展示推荐单据类型后，等待用户主动确认，不要自动跳转
