export function IssueKey({ item, link = true }) {
  if (!item?.key) return null;
  if (!link || !item.url) return <span className="issue-key">{item.key}</span>;
  return (
    <a className="issue-key" href={item.url} rel="noopener noreferrer" target="_blank">{item.key}</a>
  );
}
