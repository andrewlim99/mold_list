(function (root) {
  'use strict';
  const storageKey = 'mold-ui-language';
  let language = 'en';
  try { if (localStorage.getItem(storageKey) === 'zh-Hant') language = 'zh-Hant'; } catch (_) {}
  const dictionary = {
    'Upload Photo':'上傳照片',
    'Process':'工序','Completed At (Taiwan)':'完成時間（台灣）','Work Order':'維修申請單','Details':'詳細內容',
    'Excel reader is unavailable. Refresh the page.':'Excel 模組無法使用，請重新整理頁面。',
    'Backup Mold added and shared.':'備用模已新增並同步。','Backup Mold cancelled.':'已取消建立備用模。',
    'Choose the customer before uploading a Marketing drawing PDF.':'上傳客戶圖面前請先選擇客戶。',
    'Choose the customer for this Marketing drawing.':'請選擇此客戶圖面的客戶。',
    'Could not create the next Mold No.':'無法建立下一個模具編號。',
    'Delete failed. Please try again.':'刪除失敗，請再試一次。',
    'Delete only this Sub Mold? The original Mold will not be deleted.':'是否僅刪除此子模？原模具不會被刪除。',
    'Delete this Marketing drawing link?':'是否刪除此客戶圖面連結？',
    'Do you really want to delete this product?':'確定要刪除此產品嗎？',
    'Drawing No.':'圖號','Drawing PDF uploaded for this mold family. Press Save to link it to this product.':'此模具系列的 PDF 圖面已上傳，請按儲存連結至此產品。',
    'Drawing upload failed':'圖面上傳失敗','Drawing upload failed.':'圖面上傳失敗。',
    'Duplicate Mold No saved to shared data and highlighted in red.':'重複模具編號已儲存至共用資料，並以紅色標示。',
    'Duplicate Slip Lock saved to shared data and highlighted in red.':'重複 Slip Lock 已儲存至共用資料，並以紅色標示。',
    'Editing Sub Mold. Press Save to share this product.':'正在編輯子模，請按儲存以同步此產品。',
    'File read failed':'檔案讀取失敗','Incorrect password.':'密碼錯誤。',
    'Last action undone and shared.':'已復原上一個操作並同步。','Last action undone.':'已復原上一個操作。',
    'Marketing drawing removed. Press Save to share this product.':'客戶圖面已移除，請按儲存以同步此產品。',
    'Marketing drawing upload failed':'客戶圖面上傳失敗','Marketing drawing upload failed.':'客戶圖面上傳失敗。',
    'Material DWG':'圖面材質','Material Production':'生產材質','Mold No and Description are required.':'必須填寫模具編號與產品描述。',
    'No details':'無詳細資料','No drawing PDF saved for this mold family yet.':'此模具系列尚未儲存 PDF 圖面。',
    'No Marketing drawing PDF saved for this customer.':'此客戶尚未儲存客戶圖面。','Nothing to undo.':'沒有可復原的操作。',
    'Only PDF drawings can be uploaded.':'僅能上傳 PDF 圖面。',
    'Only the Sub Mold was deleted. Press Save to share this product.':'僅刪除子模，請按儲存以同步此產品。',
    'Open an existing product before making a Backup Mold.':'建立備用模前請先開啟既有產品。',
    'Open an existing product before uploading a drawing':'上傳圖面前請先開啟既有產品',
    'Open an existing product before uploading a drawing PDF.':'上傳 PDF 圖面前請先開啟既有產品。',
    'Open an existing product before uploading a Marketing drawing PDF.':'上傳客戶圖面前請先開啟既有產品。',
    'Product added and shared.':'產品已新增並同步。','Product deleted and shared.':'產品已刪除並同步。',
    'Product updated and shared.':'產品已更新並同步。','Product details updated':'產品資料已更新',
    'Save payload could not be created. Please refresh the page and try again.':'無法建立儲存資料，請重新整理頁面後再試。',
    'This Mold No is marked as warning. Press OK to clear the warning color for this item, or Cancel to keep the warning.':'此模具編號已標示警示。按確定移除警示顏色，或按取消保留警示。',
    'This Slip Lock is marked as warning. Press OK to clear the warning color for this item, or Cancel to keep the warning.':'此 Slip Lock 已標示警示。按確定移除警示顏色，或按取消保留警示。',
    'Undoing last action and updating shared data...':'正在復原上一個操作並更新共用資料…',
    'Update Sub Mold':'更新子模','Upload a drawing PDF for this mold family first':'請先為此模具系列上傳 PDF 圖面',
    'Upload drawing PDF for this mold family':'上傳此模具系列的 PDF 圖面',
    'Upload or enter a Marketing drawing PDF path first.':'請先上傳或輸入客戶圖面 PDF 路徑。',
    'Uploading drawing PDF...':'正在上傳 PDF 圖面…','Uploading Marketing drawing PDF...':'正在上傳客戶圖面 PDF…',
    'Warning confirmed. Highlight removed.':'已確認警示，醒目標示已移除。','Warning kept.':'已保留警示。',
    'Add at least one Sub Mold detail.':'請至少填寫一項子模資料。',
    'add a backup mold':'新增備用模','add backup mold':'新增備用模','add this product':'新增此產品',
    'delete product':'刪除產品','delete this product':'刪除此產品','edit this product':'編輯此產品','confirm warning':'確認警示',
    'Active':'使用中','Shipped':'已出貨','Fab In Progress':'製模中','Coating Required':'待鍍層',
    'Coating In Progress':'鍍層處理中','All saved records':'所有已儲存模具','Currently in production':'目前生產中',
    'Ended or replaced molds':'停用或已替換模具','Shipped out molds':'已出貨模具','Currently under fabrication':'目前製模中',
    'Stopped fabrication items':'已停止製模項目','Need coating action':'需要鍍層處理','Coating already underway':'正在進行鍍層處理',
    'Active filters':'目前篩選','Active filters :':'目前篩選：','rows visible':'筆資料',
    'Click any table cell to edit that row.':'點選資料列以編輯。',
    'PM Note':'保養備註','In':'開始','Out':'完成','Taiwan time (UTC+08:00)':'台灣時間（UTC+08:00）',
    'No PM history.':'無保養紀錄。','No repair history.':'無維修紀錄。',
    'Request Type':'申請類型','Select type':'選擇類型','Before Measurement (with unit)':'作業前測量值（含單位）',
    'After Measurement (with unit)':'作業後測量值（含單位）','Save & Receive Repair':'儲存並受理維修',
    'Reset Form':'重設表單','Current Assignment':'目前設備指派','Next Stage / Machine':'下一工序／設備',
    'Select next stage / machine':'選擇下一工序／設備','Post-injection QC Leader':'射出後 QC 主管',
    'Post-injection QC Leader approval of the entire request is required.':'必須由射出後 QC 主管核准整份申請。',
    'Discard the unsaved management entry?':'是否捨棄尚未儲存的管理資料？',
    'Choose a JPEG or PNG photo up to 5 MB.':'請選擇 5 MB 以內的 JPEG 或 PNG 照片。',
    'Enter the Mold Room Operator before uploading photos.':'上傳照片前請先填寫模具室作業人員。',
    'Uploading photo...':'正在上傳照片…','Photo uploaded. Save Work Order to record the change.':'照片已上傳，請儲存申請單以記錄變更。',
    'This request is no longer available. Refresh the history.':'此申請已不存在，請重新整理紀錄。',
    'History cleared. Work Order and current process retained.':'已清除紀錄，申請單與目前工序均保留。',
    'PM history was deleted.':'保養紀錄已刪除。','Delete timed out. Refresh and try again.':'刪除逾時，請重新整理後再試。',
    'Move to Queue before starting work on the selected machine.':'請先移至所選設備的待處理佇列，再開始作業。',
    'Choose a PM request team and Request By for that team.':'請選擇保養申請部門與申請人。',
    'Save the Work Order changes before updating the repair stage or adding a history note.':'請先儲存申請單變更，再更新工序或新增紀錄。',
    'Enter a cancellation reason in the note field.':'請於備註填寫取消原因。',
    'Enter the PM note.':'請填寫保養備註。','Enter the repair details in English.':'請以英文填寫維修內容。',
    'Enter the history note in English.':'請以英文填寫紀錄備註。',
    'Saving...':'正在儲存…','Request cancelled. You can create a new request.':'申請已取消，可建立新申請。',
    'Save timed out. Refresh the history before retrying.':'儲存逾時，請重新整理紀錄後再試。',
    'Management request failed.':'管理操作失敗。','Management history response is invalid.':'管理紀錄回應無效。',
    'Management server is unavailable. Restart start_mold_shared_server.cmd.':'管理伺服器無法使用，請重新啟動 start_mold_shared_server.cmd。',
    'Restart the shared server to enable repair photos.':'請重新啟動共用伺服器以啟用維修照片。',
    'Restart the shared server to enable repair results and approvals.':'請重新啟動共用伺服器以啟用維修結果與核准。',
    'Restart the Mold shared server to enable Work Order entry.':'請重新啟動模具共用伺服器以啟用申請單輸入。',
    'Mold List':'模具清單','Dashboard':'總覽','Mold List Dashboard':'模具清單總覽','Mold ListDashboard':'模具清單總覽',
    'Mold Management':'模具管理','Taiwan Factory':'台灣廠','Unified Mold List':'模具清單',
    'Last Updated':'最後更新','Latest 5 Products':'最近更新的 5 項產品','Search':'搜尋',
    'Mold No, Sub Mold, description, customer, material':'模具編號、子模、產品描述、客戶、材質',
    'Slip Lock Search':'Slip Lock 搜尋','Brand':'品牌','Mold No':'模具編號','Mold No.':'模具編號',
    'SAP Mold No.':'SAP 模具編號','Description':'產品描述','Revision':'版次','Rev.':'版次',
    'Customer':'客戶','Origin':'來源','Material':'材質','Material (DWG)':'圖面材質',
    'Material (Production)':'生產材質','Material (in Production)':'生產材質',
    'Material (In Production)':'生產材質','PEAK DWG / DW P/N / DWG No':'PEAK 圖號 / DW 料號 / 圖號',
    'Tray Weight':'托盤重量','Registration Date':'登錄日期','Registration':'登錄日期',
    'Silk Screen':'網版印刷','Matrix':'排列','Cell Count':'穴數','Z-gap':'Z 間距',
    'PKG Type':'封裝類型','PKG Thickness':'封裝厚度','H/L':'高／低型','Design Type':'設計類型',
    'Heat Treat Core':'模仁熱處理','Coating Check':'鍍層確認','Key Status':'主要狀態','Status':'狀態',
    'Status Note':'狀態備註','Note':'備註','Clockwise':'順時針','All':'全部','Blank':'空白',
    'In Production':'生產中','Fabrication In Progress':'製模中','Shipped Out':'已出貨',
    'Stop Fabrication':'停止製模','EOL':'停產','Unclassified':'未分類','Total Molds':'模具總數',
    'Total':'總計','Warning Items':'警示項目','Missing Drawing':'缺少圖面','Reset Filters':'重設篩選',
    'Download Excel':'下載 Excel','Refresh':'重新整理','Add Product':'新增產品','Edit Product':'編輯產品',
    'Product':'產品','Backup Mold':'備用模','Sub Mold':'子模','Create Backup Mold':'建立備用模',
    'Add Sub Mold':'新增子模','New Sub Mold':'新建子模','Delete Sub Mold':'刪除子模',
    'Save':'儲存','Close':'關閉','Cancel':'取消','Delete':'刪除','Undo':'復原','Add':'新增','Edit':'編輯',
    'Drawing':'圖面','Drawing PDF':'PDF 圖面','Marketing Drawing':'客戶圖面','Upload PDF':'上傳 PDF',
    'Open drawing PDF':'開啟 PDF 圖面','No external sharing':'禁止對外分享','Product description':'產品描述',
    'Use this panel to add a new product or update an existing one.':'新增產品或修改既有產品。',
    'Select a PDF to save it in Dashboard App/drawings. Press Save to link it to this product.':'選擇 PDF 後將儲存於 Dashboard App/drawings，按儲存以連結至此產品。',
    'Choose the customer, upload or enter the Marketing drawing PDF, then press Add. Press Save to link it to this product.':'選擇客戶並上傳或輸入客戶圖面 PDF，按新增後再儲存。',
    'Backup Mold copies every condition from this mold and creates a new normal mold with the next Mold No.':'複製此模具的所有條件，並使用下一個模具編號建立備用模。',
    'Open an existing product to create a Backup Mold.':'開啟既有產品以建立備用模。',
    'Sub Mold is saved under this mold and is not counted as a separate mold.':'子模隸屬於此模具，不另計入模具總數。',
    'Different material under same mold':'同一模具使用不同材質',
    'Yes':'是','No':'否','Check':'待確認','N/A':'不適用','Progress Required':'待處理',
    'In Progress':'進行中','Done':'完成','High':'高型','Low 1.27':'低型 1.27','Low 2.0':'低型 2.0',
    'Non-JEDEC':'非 JEDEC','Tapered':'斜壁','Flat seating':'平面支撐','Ball support':'球位支撐','Corner support':'角落支撐',
    'Blue':'藍色','Green':'綠色','Pink':'粉紅色','White':'白色','Yellow':'黃色','Gray':'灰色',
    'Blue/Green':'藍／綠','Green/Blue':'綠／藍','Brown/Yellow':'棕／黃','White/Blue':'白／藍',
    'Mold PM':'模具保養','Mold Modification / Repair':'模具修改／維修','Repair Work Order':'維修申請單',
    'Mold Repair Work Order':'模具維修工單','Mold Repair Status':'模具維修狀態',
    'PM Waiting':'保養待處理','PM In Progress':'保養中','Repair Waiting':'維修待處理',
    'Welding':'焊接','Assemble':'組裝','Outsourcing':'委外','Repair QC Approval':'維修 QC 核准',
    'Tray Injection':'托盤射出','QC Final Approval':'QC 最終核准','Urgent':'緊急','URGENT':'緊急',
    'Requested Completion Date':'要求完成日期','Open urgent repairs':'未完成的緊急維修',
    'Before Injection':'射出前','After Injection':'射出後','Injection Queue':'射出待處理',
    'External Repair':'委外維修','Laser Welding':'雷射焊接','Processing Table':'作業台',
    'Ultrasonic Cleaning':'超音波清洗','FAI, Repair':'首件／維修','Skin Down':'降面加工','EDM Head':'放電電極',
    'Idle':'閒置','Unavailable':'無法取得','Waiting':'待處理','Awaiting Next Process':'等待下一工序',
    'Awaiting PM In':'等待保養開始','Awaiting PM Out':'等待保養完成','Awaiting a process':'等待指派工序',
    'Completed':'已完成','Daily Process Completions':'每日工序完成紀錄','Date (Taiwan)':'日期（台灣）',
    'Today':'今天','All Processes':'全部工序','Daily Completion Summary':'每日完成總覽',
    'Summary':'總覽','No waiting items':'無待處理項目','Management connected':'模具管理已連線',
    'Management history unavailable':'無法取得管理紀錄','Loading management history...':'正在載入管理紀錄…',
    'Request PM':'申請保養','PM In':'保養開始','PM Out':'保養完成','No open PM':'無進行中的保養',
    'No open repair':'無進行中的維修','Received':'已受理','Request Date':'申請日期','Request No.':'申請單號',
    'Request By':'申請人','Team':'部門','Select name':'選擇姓名','Reason':'原因',
    'No.':'項次','Modification':'修改內容','Done By':'作業人員','Mold Room Operator':'模具室作業人員',
    'Remove row':'刪除此列','+ Add Row':'+ 新增一列','Save Work Order':'儲存維修申請單',
    'Print Saved Work Order':'列印已儲存申請單','Print Work Order':'列印申請單','Print / Save PDF':'列印／儲存 PDF',
    'Cancel Request':'取消申請','Clear Form':'清空表單','History':'歷史紀錄','History Note (English)':'紀錄備註（英文）',
    'Add Record':'新增紀錄','Cancel Job':'取消作業','Stage':'工序','Machine':'設備',
    'Next Machine / Process':'下一設備／工序','Select machine':'選擇設備','Select a machine':'選擇設備',
    'Move to Queue':'移至待處理','Complete & Move to Queue':'完成並移至待處理',
    'Add Parallel Queue':'新增並行設備','Start Work':'開始作業','Complete Process':'完成工序',
    'Complete QC & Repair':'完成 QC 與維修','Complete Repair':'完成維修',
    'Repair completed':'維修已完成','Machine / process changed':'已變更設備／工序','Parallel machine queued':'已加入並行設備',
    'Work started':'已開始作業','Process completed':'工序已完成','Cancelled':'已取消','Record added':'已新增紀錄',
    'Visual':'外觀','Dimensional':'尺寸','Repair Type':'維修類型','Before':'作業前','After':'作業後',
    'Before measurement':'作業前測量值','After measurement':'作業後測量值','Before Photo':'作業前照片',
    'After Photo':'作業後照片','Before photo':'作業前照片','After photo':'作業後照片',
    'Mold Room Leader':'模具室主管','Confirmed':'已確認','Repair QC Inspector':'維修 QC 檢驗員',
    'Repair Item Checked':'已確認此維修項目','Post-injection QC Inspector':'射出後 QC 檢驗員',
    'Injected Tray Checked':'已確認射出托盤','Waive':'豁免','Waive By':'豁免人員','Waive Reason':'豁免原因',
    'Repair QC Leader Approval (Before Injection)':'維修 QC 主管核准（射出前）','Repair QC Leader':'維修 QC 主管',
    'Repair Approved for Injection':'已核准進行射出','Post-injection QC Leader Approval':'射出後 QC 主管核准',
    'QC Leader':'QC 主管','Entire Request Approved':'整份申請已核准','Approved':'已核准','Pending':'待確認',
    'Pass':'合格','Fail':'不合格','Signature':'簽名','Not set':'未設定','Due':'要求完成日',
    'Pre-modification Approval 加工前確認':'加工前確認','Injection Test Results 射出測試結果':'射出測試結果',
    'Sample Tray Inspection Results 板子檢查結果':'板子檢查結果','After Modification Release 加工後可生產':'加工後可生產',
    'Choose CE or FOL.':'請選擇 CE 或 FOL。','Enter Request By.':'請選擇申請人。',
    'Choose Request By for the selected team.':'請選擇所屬部門的申請人。','Enter Reason.':'請填寫原因。',
    'Enter between 1 and 100 modification items.':'請輸入 1 至 100 項修改內容。',
    'Enter a modification for every row or remove the empty row.':'請填寫每列修改內容，或刪除空白列。',
    'Choose Visual or Dimensional for every repair item.':'請為每項維修選擇外觀或尺寸。',
    'Waive requires a reason and operator name.':'豁免必須填寫原因與人員姓名。',
    'Enter a valid requested completion date.':'請輸入有效的要求完成日期。',
    'Enter a valid date in YYYY-MM-DD format.':'請以 YYYY-MM-DD 格式輸入有效日期。',
    'Save the Work Order and item results first.':'請先儲存申請單與項目結果。',
    'Clear this unsaved Work Order?':'是否清除尚未儲存的維修申請單？',
    'No visible rows to download.':'沒有可下載的資料。',
    'Allow pop-ups to open the printable Work Order.':'請允許彈出視窗以開啟列印申請單。',
    'Save Work Order changes before changing the process.':'請先儲存申請單變更，再切換工序。',
    'This mold is no longer in the current Mold List. Its completion record is retained.':'此模具已不在目前清單中，完成紀錄仍予保留。',
    'Combine filters to focus on the molds and statuses you need.':'依條件篩選模具與狀態。',
    'New product added':'已新增產品','Product details saved':'已儲存產品資料',
    'Saved request number':'已儲存的申請單號','Preview. The final number is assigned when saved.':'預覽單號，儲存時將指派正式單號。',
    'choose Visual or Dimensional.':'請選擇外觀或尺寸。','enter the mold room operator.':'請填寫模具室作業人員。',
    'upload Before and After photos.':'請上傳作業前後照片。','enter Before and After measurements.':'請填寫作業前後測量值。',
    'measurements must contain numeric values.':'測量值必須包含數字。','Mold Room Leader confirmation is required.':'必須由模具室主管確認。',
    'Repair QC item confirmation is required.':'必須完成維修 QC 項目確認。',
    'Post-injection QC item confirmation is required.':'必須完成射出後 QC 項目確認。',
    'enter a Waive reason and operator.':'請填寫豁免原因與人員。',
    'Repair QC Leader approval is required before injection.':'射出前必須取得維修 QC 主管核准。',
    'QC Leader approval is required to complete the repair.':'完成維修前必須取得 QC 主管核准。'
  };
  const keys = new Map(Object.entries(dictionary).map(([key, value]) => [key.toLowerCase(), value]));
  function t(value) {
    const text = String(value == null ? '' : value);
    if (language === 'en') return text;
    const trimmed = text.trim(), direct = keys.get(trimmed.toLowerCase());
    if (direct) return text.replace(trimmed, direct);
    const item = trimmed.match(/^Item (\d+): (.*)$/);
    if (item) return '項目 ' + item[1] + '：' + t(item[2]);
    if (trimmed.startsWith('Enter password to ')) return '請輸入密碼以' + t(trimmed.slice(18));
    const completedLabel = trimmed.match(/^(.*) Completed(.*)$/);
    if (completedLabel) return t(completedLabel[1]) + ' 已完成' + completedLabel[2];
    const rules = [
      [/^(\d+) rows visible$/, '$1 筆資料'],
      [/^(\d+) working \/ (\d+) waiting$/, '$1 作業中／$2 待處理'],
      [/^(\d+) molds \| (\d+) (?:process completions|PM completions|completions)$/, '$1 個模具｜$2 筆完成紀錄'],
      [/^No (?:process|PM) completions on (.+)\.$/, '$1 無完成紀錄。'],
      [/^Saved at (.+)$/, '已儲存於 $1'],
      [/^PM completed today: (\d+)$/, '今日保養完成：$1'],
      [/^Mold Repair Work Order \(([^)]+)\)$/, '模具維修工單（$1）']
    ];
    for (const [pattern, replacement] of rules) if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement);
    // Translate composed UI labels without touching the underlying identifiers.
    if (trimmed.includes(' | ')) return trimmed.split(' | ').map(t).join('｜');
    const coating = trimmed.match(/^Coating: (\d+) required \/ (\d+) in progress$/);
    if (coating) return '鍍層：' + coating[1] + ' 待處理／' + coating[2] + ' 處理中';
    if (trimmed.includes(' / ')) return trimmed.split(' / ').map(t).join('／');
    const prefix = trimmed.match(/^(Completed|Due|Requested Completion Date|Active filters|Repair QC Leader|Post-injection QC Leader|Before|After|QC|Machine|Work Order): (.*)$/);
    if (prefix) return (keys.get(prefix[1].toLowerCase()) || prefix[1]) + '：' + t(prefix[2]);
    return text;
  }
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const skip = 'script,style,textarea,svg,[translate="no"],#languageSelect,#managementProduct,.recent-update-product,.mm-machine-item strong,.mm-machine-item>span,.meta td';
  function protectedText(node) {
    const element = node.parentElement;
    if (!element || element.closest(skip)) return true;
    if (element.tagName === 'OPTION' && element.closest('#brandFilter,#customerFilter,#originFilter,#materialFilter,#entryBrand,#entryMarketingCustomer,[data-order-field="requestedBy"],#managementPmRequester')) {
      if (node.nodeValue.trim() !== 'All' && node.nodeValue.trim() !== 'Select name' && !originals.has(node)) return true;
    }
    if (element.closest('#tableBody td') && !element.closest('.management-badges')) return true;
    if (element.closest('.mm-saved-items td') && !element.closest('.mm-review-saved')) return true;
    return false;
  }
  function apply(doc = document) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (protectedText(node)) continue;
      const last = originals.get(node);
      const source = last && node.nodeValue === last.translated ? last.source : node.nodeValue;
      const parent = node.parentElement;
      // Options without explicit values derive their value from the label.
      if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) parent.value = source;
      const translated = t(source);
      originals.set(node, { source, translated });
      if (node.nodeValue !== translated) node.nodeValue = translated;
    }
    doc.querySelectorAll('[title],[placeholder],[aria-label]').forEach(element => {
      if (element.closest('[translate="no"],#languageSelect')) return;
      for (const attr of ['title','placeholder','aria-label']) {
        if (!element.hasAttribute(attr)) continue;
        const saved = attributes.get(element) || {};
        const old = saved[attr];
        const current = element.getAttribute(attr);
        const source = old && current === old.translated ? old.source : current;
        const translated = t(source);
        saved[attr] = { source, translated };
        attributes.set(element, saved);
        if (current !== translated) element.setAttribute(attr, translated);
      }
    });
    doc.documentElement.lang = language;
  }
  let observer;
  function refresh() {
    observer.disconnect();
    apply();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title','placeholder','aria-label'] });
  }
  function setLanguage(value) {
    language = value === 'zh-Hant' ? 'zh-Hant' : 'en';
    try { localStorage.setItem(storageKey, language); } catch (_) {}
    refresh();
    document.title = t(document.body.classList.contains('management-mode') ? 'Mold Management' : 'Mold List Dashboard');
  }
  const nativeAlert = root.alert.bind(root), nativeConfirm = root.confirm.bind(root), nativePrompt = root.prompt.bind(root);
  root.alert = message => nativeAlert(t(message));
  root.confirm = message => nativeConfirm(t(message));
  root.prompt = (message, initial) => nativePrompt(t(message), initial);
  root.MoldI18n = { t, apply, get language() { return language; } };
  function start() {
    const select = document.getElementById('languageSelect');
    select.setAttribute('aria-label', 'Language / 語言');
    select.innerHTML = '<option value="en">English</option><option value="zh-Hant">繁體中文</option>';
    select.value = language;
    select.addEventListener('change', () => setLanguage(select.value));
    observer = new MutationObserver(refresh);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
