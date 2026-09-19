import type { Doc } from "../_generated/dataModel";

export function renderMarkdown(
  board: Doc<"boards">,
  r: Doc<"pollResults">,
  siteUrl: string,
) {
  const lines: string[] = [];
  lines.push(`# ${board.title} — poll results`);
  lines.push("");
  lines.push(`**Question:** ${r.question}`);
  lines.push(`**Closed:** ${new Date(r.closedAt).toISOString()}`);
  lines.push(
    `**Votes:** ${r.totalVotes} from ${r.participants} participants`,
  );
  lines.push("");
  lines.push("## Poll");
  for (const t of [...r.totals].sort((a, b) => b.count - a.count)) {
    const pct =
      r.totalVotes === 0 ? 0 : Math.round((t.count / r.totalVotes) * 100);
    lines.push(`- ${t.label}: **${t.count}** (${pct}%)`);
  }
  lines.push("");
  lines.push("## Ideas (by score)");
  for (const i of r.ideas) {
    lines.push(
      `- ${i.title}: ${i.score >= 0 ? "+" : ""}${i.score} (▲${i.up} ▼${i.down}, ${i.comments} comments)`,
    );
  }
  lines.push("");
  lines.push(`Board: ${siteUrl}/b/${board.slug}`);
  return lines.join("\n");
}

export function renderHtml(
  board: Doc<"boards">,
  r: Doc<"pollResults">,
  siteUrl: string,
) {
  const esc = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
    );
  const pollRows = [...r.totals]
    .sort((a, b) => b.count - a.count)
    .map((t) => {
      const pct =
        r.totalVotes === 0 ? 0 : Math.round((t.count / r.totalVotes) * 100);
      return `<tr><td>${esc(t.label)}</td><td><b>${t.count}</b></td><td>${pct}%</td></tr>`;
    })
    .join("");
  const ideaRows = r.ideas
    .map(
      (i) =>
        `<tr><td>${esc(i.title)}</td><td><b>${i.score}</b></td><td>${i.up}</td><td>${i.down}</td><td>${i.comments}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:640px">
<h1>${esc(board.title)} — poll results</h1>
<p><b>Question:</b> ${esc(r.question)}<br/><b>Closed:</b> ${new Date(r.closedAt).toUTCString()}<br/>
<b>Votes:</b> ${r.totalVotes} from ${r.participants} participants</p>
<h2>Poll</h2><table border="1" cellpadding="6" cellspacing="0"><tr><th>Option</th><th>Votes</th><th>%</th></tr>${pollRows}</table>
<h2>Ideas (by score)</h2><table border="1" cellpadding="6" cellspacing="0"><tr><th>Idea</th><th>Score</th><th>▲</th><th>▼</th><th>Comments</th></tr>${ideaRows}</table>
<p><a href="${esc(siteUrl)}/b/${esc(board.slug)}">Open the board</a></p>
</body></html>`;
}
