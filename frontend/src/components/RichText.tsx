import React from "react";
import { Text, TextStyle } from "react-native";
import { colors } from "@/src/theme/tokens";

const WIKI_RE = /\[\[([^\[\]\n]+?)\]\]/g;

/**
 * Renders text with [[Wiki Links]] highlighted in brand gold. Tapping a link
 * calls onLinkPress with the raw title (component decides how to resolve).
 */
export function RichText({
  text,
  onLinkPress,
  style,
  linkStyle,
}: {
  text: string;
  onLinkPress?: (title: string) => void;
  style?: TextStyle;
  linkStyle?: TextStyle;
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(WIKI_RE);
  let idx = 0;
  while ((match = re.exec(text || "")) !== null) {
    const before = text.slice(last, match.index);
    if (before) parts.push(<Text key={`t-${idx++}`}>{before}</Text>);
    const title = match[1].trim();
    parts.push(
      <Text
        key={`l-${idx++}`}
        onPress={() => onLinkPress?.(title)}
        style={[{ color: colors.brandPrimary, textDecorationLine: "underline" }, linkStyle]}
      >
        {title}
      </Text>,
    );
    last = match.index + match[0].length;
  }
  const tail = text?.slice(last) || "";
  if (tail) parts.push(<Text key={`t-${idx++}`}>{tail}</Text>);

  return <Text style={[{ color: colors.onSurface }, style]}>{parts}</Text>;
}
