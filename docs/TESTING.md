# 測試指南

本文檔說明如何測試餐廳搜尋功能。

## 前置準備

### 1. 設定 Google Maps API Key

1. 打開專案根目錄的 `.env.local` 檔案
2. 將你的 Google Maps API Key 貼到 `GOOGLE_MAPS_API_KEY=` 後面

範例：
```
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

**重要提醒**：
- 確保 API Key 已啟用以下服務：
  - Geocoding API
  - Places API (New)
- `.env.local` 檔案不會被提交到 Git（已在 `.gitignore` 中）
- 修改 `.env.local` 後需要重新啟動開發伺服器才會生效

## 啟動開發伺服器

在專案根目錄執行：

```bash
npm run dev
```

成功啟動後，終端會顯示：
```
  ▲ Next.js 16.0.10
  - Local:        http://localhost:3000
```

## 測試步驟

### 基本測試：中山區 + 2km

1. 用瀏覽器打開 `http://localhost:3000`
2. 確認輸入框預設值為「中山區」
3. 確認滑桿預設值為 2 km
4. 點擊「搜尋餐廳」按鈕
5. 等待搜尋結果顯示

**預期結果**：
- 顯示載入狀態（「正在搜尋餐廳...」）
- 搜尋完成後顯示餐廳列表
- 每個餐廳卡片包含：
  - 餐廳名稱
  - 地址
  - 可訂位狀態（✅ 可訂位 或 —）
  - 「在 Google Maps 開啟」按鈕

## 錯誤排查

如果 API 出錯，可以從以下三個地方查看錯誤資訊：

### 1. Terminal（終端機）

開發伺服器的終端會顯示伺服器端的錯誤：

```
Error: Geocoding API request failed
```

或

```
Error: Places API request failed: ...
```

**查看方式**：
- 查看執行 `npm run dev` 的終端視窗
- 錯誤會以紅色文字顯示
- 包含完整的錯誤堆疊資訊

### 2. Browser Network（瀏覽器開發者工具）

1. 打開瀏覽器開發者工具（F12 或右鍵 → 檢查）
2. 切換到 **Network（網路）** 分頁
3. 點擊「搜尋餐廳」按鈕
4. 找到 `/api/search` 請求
5. 點擊該請求查看詳細資訊：
   - **Headers**：查看請求標頭和參數
   - **Response**：查看 API 回傳的 JSON 資料
   - **Preview**：格式化後的回應內容

**常見錯誤狀態碼**：
- `400`：參數錯誤（例如缺少 query）
- `500`：伺服器錯誤（API Key 未設定或外部 API 失敗）

### 3. API 回傳的 error.step

API 錯誤時會回傳以下格式：

```json
{
  "error": {
    "step": "geocoding",
    "message": "Geocoding API request failed"
  }
}
```

**error.step 可能的值**：
- `config`：API Key 未設定
- `validation`：參數驗證失敗（缺少 query 或 radiusKm 超出範圍）
- `geocoding`：Geocoding API 失敗
- `places_search`：Places API Nearby Search 失敗
- `place_details`：Place Details API 失敗
- `unknown`：未知錯誤

**查看方式**：
- 在瀏覽器 Network 分頁的 Response 中查看
- 或在頁面上會直接顯示錯誤訊息（紅色錯誤框）

## 測試不同情境

### 測試不同地址

1. 在輸入框輸入其他地址（例如：「台北101」、「信義區」）
2. 點擊搜尋
3. 觀察結果是否符合預期

### 測試不同搜尋半徑

1. 調整滑桿到不同數值（0-10 km）
2. 點擊搜尋
3. 觀察結果數量是否隨半徑變化

### 測試錯誤處理

1. **測試缺少 API Key**：
   - 暫時移除 `.env.local` 中的 API Key
   - 重新啟動伺服器
   - 搜尋應該顯示「GOOGLE_MAPS_API_KEY is not configured」錯誤

2. **測試缺少 query**：
   - 清空輸入框
   - 點擊搜尋
   - 應該顯示「請輸入地址或地名」錯誤

3. **測試無結果**：
   - 輸入一個不存在的地點
   - 搜尋應該顯示「沒有找到餐廳」的空狀態

## 常見問題

### Q: 搜尋一直顯示載入中？

A: 檢查：
1. Terminal 是否有錯誤訊息
2. Browser Network 中 `/api/search` 請求的狀態
3. API Key 是否正確設定

### Q: 顯示「GOOGLE_MAPS_API_KEY is not configured」？

A: 
1. 確認 `.env.local` 檔案存在於專案根目錄
2. 確認 API Key 已正確填入
3. 重新啟動開發伺服器（修改 `.env.local` 後需要重啟）

### Q: 顯示「Geocoding failed」？

A: 
1. 確認 API Key 已啟用 Geocoding API
2. 確認 API Key 沒有達到使用限制
3. 檢查輸入的地址是否有效

### Q: 顯示「Places API request failed」？

A:
1. 確認 API Key 已啟用 Places API (New)
2. 確認 API Key 沒有達到使用限制
3. 檢查 API Key 的計費設定

## 下一步

測試完成後，可以：
- 嘗試不同的搜尋條件
- 測試各種邊界情況
- 檢查 UI 在不同瀏覽器中的顯示效果
- 測試響應式設計（調整瀏覽器視窗大小）

