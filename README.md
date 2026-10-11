# 订阅配置生成器 · Subscription Config Generator

一个**纯前端**单文件工具：填入订阅链接，一键把链接注入 `proxy-providers`，
导出可直接被 Clash / mihomo / Clash Verge 使用的完整配置。

**全程本地运行**：不联网、不上传任何数据、无后端、无第三方依赖。

---

## 用法

1. 双击打开 `index.html`（任何现代浏览器，`file://` 直接打开即可）。
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
sub-config-gen/
├─ index.html              ← 最终产物：自包含单文件工具（直接打开这个）
├─ template.yaml           ← 默认配置模板（你的原始配置副本）
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