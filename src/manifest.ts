import { defineFrontModule } from "@neton/application-front-contract";

// page.key 必须与后端 sql/postgresql/V002__menus.sql 的 system_menus.component 一一对应；
// path 与后端菜单树（目录 /pulse + 子路径）拼出的完整路由一致。
export default defineFrontModule({
  id: "pulse",
  contractVersion: "1.0.0",
  pages: [
    { key: "pulse/overview/index", path: "/pulse/overview", entry: "overview", rendering: "client" },
    { key: "pulse/apps/index", path: "/pulse/apps", entry: "apps", rendering: "client" },
    // 版本列表是应用的子页面，从应用管理带 appId 进入，因此不在后台菜单里单独出现。
    { key: "pulse/app-versions/index", path: "/pulse/app-versions", entry: "app-versions", rendering: "client" },
    { key: "pulse/events/index", path: "/pulse/events", entry: "events", rendering: "client" },
    { key: "pulse/crashes/index", path: "/pulse/crashes", entry: "crashes", rendering: "client" },
    { key: "pulse/performance/index", path: "/pulse/performance", entry: "performance", rendering: "client" },
    { key: "pulse/pipeline/index", path: "/pulse/pipeline", entry: "pipeline", rendering: "client" },
    { key: "pulse/versions/index", path: "/pulse/versions", entry: "versions", rendering: "client" },
    { key: "pulse/crash-issues/index", path: "/pulse/crash-issues", entry: "crash-issues", rendering: "client" },
    { key: "pulse/audit/index", path: "/pulse/audit", entry: "audit", rendering: "client" },
    // 规则维护是审计页的子页面，从审计页进入，不单独出现在菜单里。
    { key: "pulse/audit-rules/index", path: "/pulse/audit-rules", entry: "audit-rules", rendering: "client" },
  ],
});
