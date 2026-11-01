"use client";

import { Address } from "@scaffold-ui/components";
import { nameOf } from "~~/utils/names";

/**
 * An address with the team's own label in front of it, when we have one.
 * The label is cosmetic: every contract call still uses the raw address.
 */
export const NameTag = ({ address, size = "sm" }: { address?: string; size?: "xs" | "sm" | "base" | "lg" }) => {
  const name = nameOf(address);

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {name ? <span className="mark shrink-0">{name}</span> : null}
      <Address address={address} size={size} format="short" />
    </span>
  );
};
