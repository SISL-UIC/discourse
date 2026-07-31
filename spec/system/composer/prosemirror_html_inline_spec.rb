# frozen_string_literal: true

describe "Composer - ProseMirror - Inline HTML" do
  include_context "with prosemirror editor"

  it "keeps a span's lang while the user types inside it" do
    open_composer
    composer.toggle_rich_editor
    composer.fill_content('<span lang="ja">日本語</span>')
    composer.toggle_rich_editor

    expect(rich).to have_css("span[lang='ja']", text: "日本語")

    rich.find("span[lang='ja']").click
    composer.type_content("x")

    expect(rich).to have_css("span[lang='ja']", text: "x")

    composer.toggle_rich_editor

    # the click lands the caret between glyphs, so only the span is predictable
    expect(composer).to have_value(%r{<span lang="ja">[^<]*x[^<]*</span>})
  end
end
