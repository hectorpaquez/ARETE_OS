import React from "react";
import { StyleSheet, Text, TextStyle, View } from "react-native";
import { colors, fonts, spacing } from "@/src/theme/tokens";

/**
 * Lightweight Wikipedia-style Markdown renderer for ARETÉ.
 * Supports block types: headings (# / ## / ###), paragraphs, blockquotes (>),
 * unordered lists (- / *), ordered lists (1.), fenced code (```), and rules (---).
 * Inline: [[wiki links]], **bold**, *italic*, `inline code`.
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "hr" };

function parseBlocks(md: string): Block[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      blocks.push({ kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: h[2] });
      i++;
      continue;
    }

    // Blockquote (consecutive)
    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: buf });
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Blank line
    if (trimmed === "") {
      i++;
      continue;
    }

    // Paragraph (merge consecutive plain lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }
  return blocks;
}

const INLINE_RE = /(\[\[[^\]\n]+?\]\]|\*\*[^*\n]+?\*\*|`[^`\n]+?`|\*[^*\n]+?\*)/g;

function renderInline(
  text: string,
  keyPrefix: string,
  onLinkPress?: (title: string) => void,
  baseStyle?: TextStyle,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE);
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Text key={`${keyPrefix}-t${k++}`}>{text.slice(last, m.index)}</Text>);
    }
    const tok = m[0];
    if (tok.startsWith("[[")) {
      const title = tok.slice(2, -2).trim();
      out.push(
        <Text
          key={`${keyPrefix}-l${k++}`}
          onPress={() => onLinkPress?.(title)}
          style={styles.link}
        >
          {title}
        </Text>,
      );
    } else if (tok.startsWith("**")) {
      out.push(
        <Text key={`${keyPrefix}-b${k++}`} style={styles.bold}>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <Text key={`${keyPrefix}-c${k++}`} style={styles.inlineCode}>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith("*")) {
      out.push(
        <Text key={`${keyPrefix}-i${k++}`} style={styles.italic}>
          {tok.slice(1, -1)}
        </Text>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    out.push(<Text key={`${keyPrefix}-t${k++}`}>{text.slice(last)}</Text>);
  }
  return out;
}

export function MarkdownBlocks({
  content,
  onLinkPress,
}: {
  content: string;
  onLinkPress?: (title: string) => void;
}) {
  const blocks = parseBlocks(content);
  return (
    <View>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "h1":
            return (
              <Text key={idx} style={[styles.h1, idx > 0 && styles.headingTop]}>
                {renderInline(b.text, `h1-${idx}`, onLinkPress)}
              </Text>
            );
          case "h2":
            return (
              <Text key={idx} style={[styles.h2, idx > 0 && styles.headingTop]}>
                {renderInline(b.text, `h2-${idx}`, onLinkPress)}
              </Text>
            );
          case "h3":
            return (
              <Text key={idx} style={[styles.h3, idx > 0 && styles.headingTop]}>
                {renderInline(b.text, `h3-${idx}`, onLinkPress)}
              </Text>
            );
          case "quote":
            return (
              <View key={idx} style={styles.quote}>
                {b.lines.map((ln, j) => (
                  <Text key={j} style={styles.quoteText}>
                    {renderInline(ln, `q-${idx}-${j}`, onLinkPress)}
                  </Text>
                ))}
              </View>
            );
          case "ul":
            return (
              <View key={idx} style={styles.list}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.liText}>{renderInline(it, `ul-${idx}-${j}`, onLinkPress)}</Text>
                  </View>
                ))}
              </View>
            );
          case "ol":
            return (
              <View key={idx} style={styles.list}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.li}>
                    <Text style={styles.olNum}>{j + 1}.</Text>
                    <Text style={styles.liText}>{renderInline(it, `ol-${idx}-${j}`, onLinkPress)}</Text>
                  </View>
                ))}
              </View>
            );
          case "code":
            return (
              <View key={idx} style={styles.codeBlock}>
                <Text style={styles.codeText}>{b.text}</Text>
              </View>
            );
          case "hr":
            return <View key={idx} style={styles.hr} />;
          case "p":
          default:
            return (
              <Text key={idx} style={styles.p}>
                {renderInline(b.text, `p-${idx}`, onLinkPress)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.displaySerif, fontSize: 26, color: colors.onSurface, lineHeight: 32 },
  h2: {
    fontFamily: fonts.displaySerif,
    fontSize: 22,
    color: colors.onSurface,
    lineHeight: 28,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.xs,
  },
  h3: { fontFamily: fonts.displaySerif, fontSize: 18, color: colors.onSurface, lineHeight: 24 },
  headingTop: { marginTop: spacing.xl },
  p: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 26,
    color: colors.onSurface,
    marginTop: spacing.md,
  },
  link: { color: colors.brandPrimary, textDecorationLine: "underline" },
  bold: { fontWeight: "700", color: colors.onSurface },
  italic: { fontStyle: "italic" },
  inlineCode: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.brandPrimary,
    backgroundColor: colors.surfaceTertiary,
  },
  quote: {
    marginTop: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandPrimary,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.xs,
  },
  quoteText: {
    fontFamily: fonts.displaySerif,
    fontSize: 17,
    fontStyle: "italic",
    color: colors.onSurfaceSecondary,
    lineHeight: 26,
  },
  list: { marginTop: spacing.md, gap: spacing.xs },
  li: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  bullet: { color: colors.brandPrimary, fontSize: 16, lineHeight: 26 },
  olNum: { color: colors.brandPrimary, fontSize: 15, lineHeight: 26, minWidth: 20 },
  liText: { flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 26, color: colors.onSurface },
  codeBlock: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.lg,
  },
  codeText: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20, color: colors.onSurfaceSecondary },
  hr: { height: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.xl },
});

export default MarkdownBlocks;
