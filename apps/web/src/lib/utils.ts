import { createCn } from "cn/config";

// cn() with the page's own tracking tokens, so a later tracking-* replaces an earlier one.
const cn = createCn({
  extend: {
    classGroups: { tracking: [{ tracking: ["label", "caption"] }] },
  },
});

export { cn };
