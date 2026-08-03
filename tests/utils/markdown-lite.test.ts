import { describe, expect, it } from "vitest";
import { markdownLiteToHtml } from "@/utils/markdownLite";

describe("markdownLiteToHtml", () => {
  it("renders bold", () => {
    expect(markdownLiteToHtml("**bold**")).toBe("<strong>bold</strong>");
  });

  it("renders italic", () => {
    expect(markdownLiteToHtml("*italic*")).toBe("<em>italic</em>");
  });

  it("renders strikethrough", () => {
    expect(markdownLiteToHtml("~~gone~~")).toBe("<del>gone</del>");
  });

  it("renders inline code", () => {
    expect(markdownLiteToHtml("`x = 1`")).toBe("<code>x = 1</code>");
  });

  it("renders GitHub hard line break", () => {
    expect(markdownLiteToHtml("line one  \nline two")).toBe(
      "line one<br />line two",
    );
  });

  it("renders bullet line", () => {
    expect(markdownLiteToHtml("  * item")).toBe("<ul><li>item</li></ul>");
  });

  it("groups consecutive bullets", () => {
    expect(markdownLiteToHtml("  * a\n  * b")).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
  });

  it("escapes HTML", () => {
    expect(markdownLiteToHtml("<script>x</script>")).toBe(
      "&lt;script&gt;x&lt;/script&gt;",
    );
  });

  it("leaves unclosed delimiters literal", () => {
    expect(markdownLiteToHtml("**open")).toBe("**open");
  });

  it("does not format inside code spans", () => {
    expect(markdownLiteToHtml("`**not bold**`")).toBe(
      "<code>**not bold**</code>",
    );
  });

  it("combines inline styles", () => {
    expect(markdownLiteToHtml("**b** and *i*")).toBe(
      "<strong>b</strong> and <em>i</em>",
    );
  });

  it("separates bullet block from plain line", () => {
    expect(markdownLiteToHtml("plain\n  * bullet")).toBe(
      "plain<br /><ul><li>bullet</li></ul>",
    );
  });
});
