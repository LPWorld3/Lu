# 族谱

在线浏览：启用 GitHub Pages 后访问 `https://<用户名>.github.io/<仓库名>/`

纯静态页面（HTML + 原生 JS），无需构建、无需后端。**页面为只读展示**：
所有修改在本地工作版完成，更新后重新上传本目录即可。

## 文件结构
- `index.html` —— 族谱页面（只读展示版，勿手改，由构建脚本生成）
- `data.js`   —— **族谱数据（唯一数据源）**，更新数据只改这个文件
- `.nojekyll` —— 跳过 GitHub Pages 的 Jekyll 处理

## 数据更新流程（唯一入口：本地工作版）
1. 在本地工作版（`族谱网页.html`）中添加/编辑/调整数据；
2. 把最新数据同步进 `data.js`（改完工作版后运行 `node ../build_github.js` 自动重新生成，
   或手动把 `GENEALOGY` 初始数据的内容替换到 `data.js` 的 `window.ZUPU_DATA = { ... }` 里）；
3. 提交并推送：
   ```bash
   git add . && git commit -m "更新族谱数据" && git push
   ```
4. GitHub Pages 会自动发布最新版本（首次需在仓库 Settings → Pages 里启用，选 main 分支根目录）。

## data.js 数据结构
```js
window.ZUPU_DATA = {
  "surname": "姓氏",
  "introText": "",
  "generations": [
    { "title": "第一世", "people": [
      { "givenName": "名字",            // 名（不含姓）
        "spouse": "配偶姓氏",             // 配偶
        "note": "",                     // 备注（自动换行，最多3行）
        "sex": "m",                     // m 男 / f 女
        "birth": "", "death": "",       // 生 / 卒
        "sonCount": 3,                  // 子的总数（含未录名者，可选）
        "sons": [                       // 子嗣（按长幼排序，第一位=长子，显示在最右）
          { "givenName": "玘", "sex": "m" },
          { "givenName": "旺", "sex": "m", "adopt": true }  // adopt=true 继子（连线上标注）
        ] }
    ] }
  ]
}
```

当前数据规模：18 个世代，共 610 位已录入人物。
