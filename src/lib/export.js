import { t } from "@lingui/core/macro";

// Byte-order mark: leads CSV output so Excel opens it as UTF-8 rather than ANSI,
// keeping emoji, fractions, and accented names intact. Built from a char code so
// the source file stays pure ASCII.
const UTF8_BOM = String.fromCharCode(0xfeff);

export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Escape the table-cell delimiter so a name/vote containing "|" can't break the
// generated Markdown table layout.
function mdCell(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

// Safari and Firefox read the blob after click() returns, so revoking straight
// away cancels the download. A minute is far longer than any browser needs and
// still bounds how long the blob is held.
const REVOKE_DELAY_MS = 60_000;

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

export function exportHistory(room, format) {
  const filename = room.name.toLowerCase().replaceAll(" ", "-");
  const issues = new Map(room.items.filter((item) => item.key).map((item) => [item.id, item]));

  if (format === "csv") {
    const header = [t`Item`, t`Final estimate`, t`Suggested estimate`, t`Agreement`, t`Voter`, t`Vote`, t`Confirmed`, t`Completed`];
    const rows = [issues.size ? [t`Issue`, ...header, t`Link`] : header];
    room.history.slice().reverse().forEach((item) => {
      const issue = issues.get(item.itemId);
      item.votes.forEach((vote) => {
        const row = [
          item.title,
          item.finalValue,
          item.suggestion?.value ?? "",
          item.metrics ? `${item.metrics.consensusPercent}%` : "",
          vote.participantName,
          vote.value ?? "",
          vote.confirmed ? t`Yes` : t`No`,
          new Date(item.completedAt).toISOString(),
        ];
        rows.push(issues.size ? [issue?.key ?? "", ...row, issue?.url ?? ""] : row);
      });
    });
    downloadText(
      `${filename}-estimates.csv`,
      `${UTF8_BOM}${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`,
      "text/csv",
    );
    return;
  }

  const roomName = room.name;
  const lines = [`# ${t`${roomName} estimates`}`, ""];
  room.history.slice().reverse().forEach((item) => {
    const issue = issues.get(item.itemId);
    lines.push(`## ${issue ? `[${issue.key}](${issue.url}) ` : ""}${item.title}`, "", `- ${t`Final estimate`}: **${item.finalValue}**`);
    lines.push(`- ${t`Suggested estimate`}: ${item.suggestion?.value ?? t`None`}`);
    if (item.metrics) lines.push(`- ${t`Agreement`}: ${item.metrics.consensusPercent}%`);
    lines.push("", `| ${t`Participant`} | ${t`Vote`} |`, "| --- | --- |");
    item.votes.forEach((vote) => lines.push(`| ${mdCell(vote.participantName)} | ${mdCell(vote.value ?? t`No vote`)} |`));
    lines.push("");
  });
  downloadText(`${filename}-estimates.md`, lines.join("\n"), "text/markdown");
}
