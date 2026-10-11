# Mihomo 配置生成器 · mihomoConfigGen

一个**纯前端**单文件工具，用于**转换 / 生成 mihomo（Clash.Meta）配置**：
填入订阅链接，一键把链接注入配置模板的 `proxy-providers`，
导出可直接被 mihomo / Clash Verge / Clash.Meta 使用的完整配置。

**全程本地运行**：不联网、不上传任何数据、无后端、无第三方依赖。

在线版（GitHub Pages）：`https://<你的用户名>.github.io/mihomoConfigGen/`

---

## 用法

1. 打开 `index.html`（本地双击即可，或用上面的在线地址）。
2. **配置模板**：默认使用内置模板（即 `template.yaml`）；也可以「上传自定义模板」，
   上传自己的 `.yaml`（模板中必须存在顶层键 `proxy-providers:`）。
3. **订阅列表**：填写「名称 + 订阅链接」，可点「添加订阅」增加多行。名称不可重复。
4. **生成与导出**：填输出文件名 → 点「生成配置」→ 预览无误后「复制」或「下载」。

生成的配置里，每个订阅会写成引用形式（沿用模板里的 `&p` 锚点）：

```yaml
proxy-providers:
  custom_name1:
    <<: *p
    url: "https://你的订阅地址"

  custom_name2:
    <<: *p
    url: "https://你的订阅地址2"
```

> 订阅链接只是被**原样写入 `url` 字段**，真实拉取发生在客户端运行时
> （mihomo 自己去请求订阅）。所以本工具不需要访问网络，也就没有 CORS 问题。

---

## 目录结构

```
mihomoConfigGen/
├─ index.html              ← 最终产物：自包含单文件工具（直接打开这个）
├─ template.yaml           ← 默认配置模板（你的原始配置副本）
├─ .nojekyll               ← 供 GitHub Pages 跳过 Jekyll 处理
├─ .github/workflows/
│  └─ pages.yml            ← 自动构建 + 自测 + 部署到 GitHub Pages
├─ README.md
└─ build/                  ← 构建源码（一般无需改动）
   ├─ app.template.html    ← 应用外壳（含 /*__CORE__*/ 与 __BUILTIN_TEMPLATE__ 占位符）
   ├─ core.mjs             ← 共享纯逻辑（浏览器与测试使用同一份代码）
   ├─ build.mjs            ← 把 core.mjs + template.yaml 内联进 app 模板 → index.html
   └─ selftest.mjs         ← 单元自测（26 项）
```

### 为什么不直接手写 index.html？

`index.html` 里内嵌了完整的 536 行模板。为避免人工复制粘贴出错，
`index.html` 由 `build/build.mjs` **确定性生成**：它读取 `template.yaml` 原文和
`build/core.mjs`，注入到 `build/app.template.html` 的占位符中。

---

## 重新构建 / 测试

```bash
node build/build.mjs     # 重新生成 index.html
node build/selftest.mjs  # 运行自测
```

测试覆盖：模板解析、`proxy-providers` 块定位与替换（前缀/后缀逐字节保持不变）、
锚点检测与无锚点回退、YAML 取值转义、订阅校验（空值/重复名）等。

---

## 部署到 GitHub Pages

仓库已内置工作流 `.github/workflows/pages.yml`：**push 到 `main`/`master` 后自动
重建 `index.html`、跑自测、部署到 Pages**（保证线上产物与源码永远一致）。

推荐配置（Actions 方式）：

1. 新建 GitHub 仓库并推送本目录。
2. 仓库 → Settings → Pages → **Source: GitHub Actions**。
3. 推送后等一次 Actions 跑完，访问 `https://<用户名>.github.io/mihomoConfigGen/`。

也可以改用「分支方式」（不需要 Actions）：

- Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / 目录: `/(root)`。
- 根目录的 `.nojekyll` 会让 Pages 跳过 Jekyll 处理。

> 前提：Pages 需要 **Public** 仓库（私有仓库用 Pages 需 GitHub Pro）。

---

## 工作原理

1. 在模板中定位顶层键 `proxy-providers:`，以及它之后的下一个顶层键（如 `proxies:`）。
2. 用新的 provider 块替换这一段，模板其余部分逐字节保持不变。
3. 若模板定义了 `&p` 锚点，新条目用 `<<: *p` 继承；否则内联完整 provider 属性。
4. 通过 `Blob` + `URL.createObjectURL` 触发浏览器下载。

---

## 边界说明

- 本工具**不校验订阅是否可达 / 不预览节点**——那需要浏览器去 fetch 订阅，会被 CORS 拦截。
  本工具只做「链接注入」，因此保持纯前端。
- 订阅链接属于账号凭证，本工具不会把它发送到任何地方。
- **不要把自己的真实订阅链接提交进 `template.yaml`**（仓库可能是公开的）。保持其为空，
  让使用者在自己的浏览器里填写。