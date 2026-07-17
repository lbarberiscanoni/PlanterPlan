import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * Renders trusted-but-user-authored task copy (purpose / description / actions)
 * as sanitized HTML. Migrated task content embeds `<a href>` links and may carry
 * ordered/unordered lists and basic inline emphasis; plain-text rendering showed
 * those as literal escaped tags. This whitelists a minimal safe subset and drops
 * everything else (scripts, event handlers, styles, etc.).
 */
const ALLOWED_TAGS = ['a', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

// Tailwind's reset strips list markers and link styling, so re-assert them via
// arbitrary variants scoped to this container. Keeps parity for prose while
// making any embedded lists/links actually look like lists/links.
const RICH_TEXT_CLASSES = [
    '[&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700',
    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
    '[&_li]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0',
].join(' ');

function sanitize(html: string): string {
    // Force embedded anchors to open safely in a new tab. Hooks are global, so add
    // and remove around this synchronous call to avoid leaking into other callers
    // (e.g. posthog-js, which shares the DOMPurify singleton).
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.nodeName === 'A' && node.getAttribute('href')) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer nofollow');
        }
    });
    const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
    DOMPurify.removeHook('afterSanitizeAttributes');
    return clean;
}

interface RichTextProps {
    /** Raw HTML string from a task field. Sanitized before rendering. */
    html: string;
    /** Extra classes for the wrapping element (layout, typography, spacing). */
    className?: string;
}

export function RichText({ html, className }: RichTextProps) {
    const clean = useMemo(() => sanitize(html), [html]);
    return (
        <div
            className={[RICH_TEXT_CLASSES, className].filter(Boolean).join(' ')}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
}
