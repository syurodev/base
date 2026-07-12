# DevKit Documentation Completion Design

**Date:** 2026-07-12  
**Status:** Approved direction; implementation pending  
**Scope:** `/Users/syuro/Workspace/PERSONAL/base/content/projects/dev-kit`

## Goal

Hoàn thiện bộ tài liệu DevKit thành một source of truth nội bộ có thể dùng để
hiểu kiến trúc, kiểm tra trạng thái implementation, tiếp tục phát triển và vận
hành dự án — nhưng không trộn trạng thái thay đổi theo thời gian vào phần
knowledge có tính ổn định.

## Design decision

Tách tài liệu thành hai lớp độc lập trong cùng một project:

1. **Knowledge layer** mô tả vision, principles, architecture, security model,
   module concepts và các thiết kế dài hạn. Các trang này ưu tiên ổn định và
   không chứa bảng status implementation.
2. **Project-state layer** mô tả trạng thái thực tế của checkout, roadmap,
   contracts, security controls, operations và các quyết định đã chốt. Đây là
   nơi duy nhất dùng các nhãn `Implemented`, `Partial`, `Design only`,
   `Not started` và các thông tin có thể thay đổi theo commit.

Knowledge pages có thể liên kết sang project-state pages khi cần đối chiếu,
nhưng project-state không được làm thay đổi cấu trúc hoặc ý nghĩa của knowledge
pages.

## Alternatives considered

### Status badges trên từng knowledge page

Không chọn. Status sẽ nhanh chóng trở nên lỗi thời và làm các trang nguyên tắc
khó đọc.

### Nhân đôi tài liệu thành current và target

Không chọn. Hai bản sẽ trùng lặp, dễ drift và làm người đọc không biết nên bắt
đầu từ bản nào.

### Tách Knowledge và Project state

Chọn. Cách này giữ được knowledge có vòng đời dài, đồng thời cho phép cập nhật
status, roadmap và runbook theo implementation mà không rewrite toàn bộ kiến
trúc.

## Information architecture

### Knowledge

Giữ các nhóm hiện tại:

- Intro: `index`, `vision`
- Architecture: `system-overview`, `runtime`, `data-sync`
- Modules: `vault`, `connections`, `tools`, `plugins`
- AI & Security: `mcp-agent`, `security`

Các trang này sẽ được chỉnh copy ở những chỗ đang vô tình khẳng định một
feature tương lai đã chạy thật. Nội dung architectural target vẫn được giữ.

### Project state

Thêm một section riêng trong `meta.json`:

- `implementation-status`
- `roadmap`
- `technical-contracts`
- `security-controls`
- `operations`
- `architecture-decisions`

Các trang project-state có trách nhiệm như sau:

| Page | Responsibility |
|---|---|
| `implementation-status` | Snapshot theo module, verified commit/date, implemented/partial/design-only/not-started và limitations |
| `roadmap` | Phase 0–5, mục tiêu, completion criteria, dependency và next work |
| `technical-contracts` | Wails bridge, DTOs, public errors, capabilities, scopes, persistence boundaries và compatibility rules |
| `security-controls` | Security controls đã có trong code, threat coverage, test evidence và remaining risks |
| `operations` | Prerequisites, dev/server commands, verification commands, data path, backup/recovery và troubleshooting |
| `architecture-decisions` | ADR-style records cho các quyết định đã chốt, alternatives và consequences |

## Current implementation truth to document

Project-state pages phải phản ánh code hiện tại, không chỉ copy lại design cũ:

- Phase 0/core foundation đã hoàn tất.
- Local runtime hiện có Workbench, Vault gate, Tools/hash, encrypted Notes,
  SSH profiles/host-key verification và PostgreSQL profiles/query.
- Sensitive bridge calls đi qua `AppService.call` và Capability Gateway.
- Audit redaction, structured public errors, SQLite `0600`, `DELETE` journal
  mode, V1/V2 envelope compatibility với V2 AAD, SSH host-key pinning, DB TLS
  defaults/pooling và loopback-only server mode đã được triển khai.
- MCP runtime, sync client/server, external plugin runtime, marketplace và
  persistent vault-item repository chưa được xem là implemented.
- SQLite hiện dùng application-layer encryption cho sensitive fields; không
  mô tả là toàn bộ database được SQLCipher mã hóa.

Mỗi status claim phải có source path hoặc verification command để người đọc có
thể kiểm tra lại.

## Knowledge-layer rules

- Không thêm status table, progress percentage hoặc last-verified commit vào
  các knowledge pages.
- Dùng ngôn ngữ `designed to`, `target architecture`, `must` hoặc `should` cho
  các phần chưa có runtime implementation.
- Giữ các diagrams ở dạng architecture/flow diagram; không dùng chúng làm bằng
  chứng feature đã shipped.
- Khi một trang cần nói về implementation để tránh gây hiểu sai, chỉ thêm một
  liên kết ngắn sang `implementation-status`, không nhúng toàn bộ status vào
  trang đó.
- Đóng hoặc chuyển các open question đã có quyết định thành ADR; chỉ giữ câu
  hỏi thật sự chưa chốt.

## Status vocabulary

Các trang project-state dùng đúng bốn trạng thái:

- `Implemented`: có runtime code và test/build evidence phù hợp.
- `Partial`: có một phần runtime nhưng còn thiếu capability hoặc production
  behavior quan trọng.
- `Design only`: có architecture/spec nhưng chưa có runtime package/flow.
- `Not started`: chưa có implementation đáng kể.

Không dùng `Complete` nếu chưa nêu rõ phạm vi và evidence.

## Documentation quality gates

Trước khi coi việc hoàn thiện docs là xong:

1. `meta.json` chỉ trỏ tới các page tồn tại.
2. Mỗi page có frontmatter `title` và `description`, H1 khớp title.
3. Mỗi trang architecture/flow-heavy có diagram hoặc lý do rõ ràng nếu không
   cần diagram.
4. Không còn claim MCP/sync/plugin/lazy worker là runtime đã có nếu source chưa
   chứng minh điều đó.
5. Security claims có control hoặc test evidence tương ứng.
6. Open questions không còn chứa các quyết định đã chốt.
7. `bun run types:check`, `bun run build` và `bun run lint` pass trong `base`.
8. Knowledge layer và project-state layer có navigation rõ, không duplicate
   toàn bộ nội dung.

## Out of scope

- Không sửa code runtime của DevKit.
- Không triển khai MCP, sync, plugin runtime hoặc SaaS backend.
- Không thay đổi product direction chỉ để làm docs đẹp hơn.
- Không di chuyển hoặc xóa lịch sử spec/plan hiện có; chỉ thêm liên kết hoặc
  decision record khi cần.

## Expected deliverables

- Cập nhật các knowledge pages để diễn đạt đúng là principles/target design.
- Tạo sáu project-state pages theo information architecture ở trên.
- Cập nhật `meta.json` và các trang liên quan bằng links phù hợp.
- Bổ sung ADR cho các quyết định security/storage/repository quan trọng đã chốt.
- Chạy và ghi nhận đầy đủ các documentation quality gates.
