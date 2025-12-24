/**
 * ノート解析モジュール
 * Markdownノートを構造化データに変換
 */

import type { ParsedNote, Section } from '../types';

export class NoteParser {
  /**
   * ノート全文を解析
   */
  parse(content: string): ParsedNote {
    const frontmatter = this.extractFrontmatter(content);
    const bodyContent = this.removeFrontmatter(content);
    const sections = this.extractSections(bodyContent);

    return {
      frontmatter,
      sections,
      rawContent: content,
    };
  }

  /**
   * frontmatterを抽出
   */
  private extractFrontmatter(content: string): string | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : null;
  }

  /**
   * frontmatterを除去
   */
  private removeFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  /**
   * 見出しでセクション分割
   */
  private extractSections(content: string): Section[] {
    const lines = content.split('\n');
    const sections: Section[] = [];
    let currentSection: Section | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 前のセクションを保存
        if (currentSection) {
          currentSection.lineEnd = i - 1;
          sections.push(currentSection);
        }

        // 新しいセクション開始
        currentSection = {
          heading: line,
          level: headingMatch[1].length,
          content: '',
          lineStart: i,
          lineEnd: i,
        };
      } else if (currentSection) {
        // セクション本文に追加
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      } else {
        // 見出しなしの冒頭コンテンツ
        if (line.trim() && !currentSection) {
          currentSection = {
            heading: '',
            level: 0,
            content: line,
            lineStart: i,
            lineEnd: i,
          };
        }
      }
    }

    // 最後のセクションを保存
    if (currentSection) {
      currentSection.lineEnd = lines.length - 1;
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 見出しテキストのリストを取得
   */
  getHeadingsList(parsed: ParsedNote): string[] {
    return parsed.sections
      .filter((s) => s.heading)
      .map((s) => s.heading);
  }

  /**
   * 指定した見出しの行番号を取得
   */
  findHeadingLine(parsed: ParsedNote, heading: string): number | null {
    const section = parsed.sections.find((s) => s.heading === heading);
    return section ? section.lineStart : null;
  }
}
