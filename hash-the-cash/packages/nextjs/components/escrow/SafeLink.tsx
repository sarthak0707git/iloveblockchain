import { ReactNode } from "react";
import { safeHref } from "~~/utils/taskEscrow";

/**
 * Renders a user-supplied URI as a link only when it is http(s) or ipfs://.
 * Anything else (javascript:, data:, ...) is shown as inert text instead.
 */
export const SafeLink = ({
  uri,
  children,
  className = "link link-primary break-all",
}: {
  uri: string;
  children?: ReactNode;
  className?: string;
}) => {
  const href = safeHref(uri);

  if (!href) {
    return (
      <span className="break-all opacity-70" title="This link was not a safe http(s) or ipfs address.">
        {children ?? uri}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? uri}
    </a>
  );
};
