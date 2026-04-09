from manim import *

# -- Komma brand palette --
BG = "#151722"
SURFACE = "#1b1d2e"
PRIMARY = "#6E57FF"
GREEN = "#7ee09b"
RED = "#f08080"
MUTED = "#6b6d80"
FG = "#e0e0ea"
FAINT = "#3a3c50"
MONO = "Menlo"

# -- Timing --
FAST = 0.6
NORMAL = 1.0
SLOW = 1.8


class Scene1_Title(Scene):
    def construct(self):
        self.camera.background_color = BG

        # Logo: stylized K using shapes
        logo_bg = RoundedRectangle(
            corner_radius=0.35, width=2.2, height=2.2,
            fill_color=SURFACE, fill_opacity=1,
            stroke_color=PRIMARY, stroke_width=2
        )
        # K shape from two lines
        k_vert = Line(UP * 0.6, DOWN * 0.6, color=PRIMARY, stroke_width=6).shift(LEFT * 0.3)
        k_diag1 = Line(DOWN * 0.1 + LEFT * 0.3, UP * 0.6 + RIGHT * 0.35, color=PRIMARY, stroke_width=6)
        k_diag2 = Line(DOWN * 0.1 + LEFT * 0.3, DOWN * 0.6 + RIGHT * 0.35, color=PRIMARY, stroke_width=4)
        k_shape = VGroup(k_vert, k_diag1, k_diag2)
        logo = Group(logo_bg, k_shape).move_to(UP * 0.8)

        title = Text("komma", font_size=56, color=FG, weight=BOLD, font=MONO)
        title.next_to(logo, DOWN, buff=0.5)

        subtitle = Text(
            "AI edits with you, not for you",
            font_size=26, color=MUTED, font=MONO
        )
        subtitle.next_to(title, DOWN, buff=0.3)

        self.add_subcaption("Komma", duration=2)
        self.play(FadeIn(logo, scale=0.8), run_time=NORMAL)
        self.wait(0.5)

        self.add_subcaption("komma", duration=1.5)
        self.play(Write(title), run_time=NORMAL)
        self.wait(0.3)

        self.add_subcaption("AI edits with you, not for you", duration=2)
        self.play(FadeIn(subtitle, shift=UP * 0.2), run_time=FAST)
        self.wait(1.5)

        self.play(FadeOut(Group(*self.mobjects)), run_time=FAST)
        self.wait(0.3)


class Scene2_Editor(Scene):
    def construct(self):
        self.camera.background_color = BG

        # Editor window
        editor = RoundedRectangle(
            corner_radius=0.2, width=11, height=5.5,
            fill_color=SURFACE, fill_opacity=1,
            stroke_color=FAINT, stroke_width=1
        )

        # Titlebar
        titlebar = Rectangle(
            width=11, height=0.5,
            fill_color="#12131f", fill_opacity=1,
            stroke_width=0
        ).align_to(editor, UP)

        dot_r = Dot(radius=0.08, color="#ff5f57").move_to(titlebar.get_left() + RIGHT * 0.5)
        dot_y = Dot(radius=0.08, color="#febc2e").next_to(dot_r, RIGHT, buff=0.15)
        dot_g = Dot(radius=0.08, color="#28c840").next_to(dot_y, RIGHT, buff=0.15)

        filename = Text("product-spec.md", font_size=16, color=MUTED, font=MONO)
        filename.move_to(titlebar)

        titlebar_group = Group(titlebar, dot_r, dot_y, dot_g, filename)

        # Document lines
        lines_data = [
            ("# Product Requirements", PRIMARY, 28),
            ("", FG, 22),
            ("The product should be designed to", FG, 22),
            ("provide users with a comprehensive", FG, 22),
            ("set of tools that will enable them", FG, 22),
            ("to accomplish their goals efficiently.", FG, 22),
            ("", FG, 22),
            ("It is important that the interface", FG, 22),
            ("is intuitive and easy to understand.", FG, 22),
        ]

        doc_lines = []
        for text, color, size in lines_data:
            if text:
                line = Text(text, font_size=size, color=color, font=MONO)
            else:
                line = Text(" ", font_size=size, color=color, font=MONO)
            doc_lines.append(line)

        doc_group = Group(*doc_lines).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        doc_group.move_to(editor.get_center() + DOWN * 0.3 + LEFT * 0.3)

        window = Group(editor, titlebar_group)

        self.add_subcaption("A clean markdown editor", duration=2)
        self.play(FadeIn(window), run_time=FAST)
        self.wait(0.3)

        self.add_subcaption("Write your document", duration=3)
        self.play(
            LaggedStart(
                *[FadeIn(line, shift=RIGHT * 0.3) for line in doc_lines],
                lag_ratio=0.12, run_time=2.0
            )
        )
        self.wait(0.8)

        # Highlight lines 3-6 (the wordy text)
        highlight_lines = Group(*doc_lines[2:6])
        highlight_rect = SurroundingRectangle(
            highlight_lines, color=PRIMARY, buff=0.1,
            corner_radius=0.08, stroke_width=2,
            fill_color=PRIMARY, fill_opacity=0.08
        )

        self.add_subcaption("Select text and press Cmd+K", duration=2)
        self.play(Create(highlight_rect), run_time=NORMAL)
        self.wait(0.3)

        # Cmd+K badge
        cmdk_bg = RoundedRectangle(
            corner_radius=0.12, width=2.8, height=0.5,
            fill_color=PRIMARY, fill_opacity=0.15,
            stroke_color=PRIMARY, stroke_width=1.5
        )
        cmdk_text = Text("Cmd+K", font_size=18, color=PRIMARY, weight=BOLD, font=MONO)
        cmdk_label = Text("Make this more concise", font_size=16, color=FG, font=MONO)
        cmdk_text.move_to(cmdk_bg)
        cmdk_row = Group(cmdk_bg, cmdk_text)
        cmdk_row.next_to(highlight_rect, RIGHT, buff=0.3)

        self.play(FadeIn(cmdk_row, scale=0.9), run_time=FAST)
        self.wait(0.3)

        cmdk_label.next_to(cmdk_row, DOWN, buff=0.15).align_to(cmdk_row, LEFT)
        self.play(Write(cmdk_label), run_time=FAST)
        self.wait(1.0)

        # Store everything for next scene
        self.play(FadeOut(Group(*self.mobjects)), run_time=FAST)
        self.wait(0.3)


class Scene3_Approval(Scene):
    def construct(self):
        self.camera.background_color = BG

        # Section label
        label = Text("AGENT WORKFLOW", font_size=16, color=PRIMARY, font=MONO, weight=BOLD)
        label.to_edge(UP, buff=0.6)
        self.play(FadeIn(label), run_time=0.4)

        # Diff view panel
        panel = RoundedRectangle(
            corner_radius=0.2, width=10, height=4.5,
            fill_color=SURFACE, fill_opacity=1,
            stroke_color=FAINT, stroke_width=1
        ).shift(DOWN * 0.2)

        self.add_subcaption("Claude proposes changes as a diff", duration=3)
        self.play(FadeIn(panel), run_time=FAST)

        # Removed lines
        rm1 = self._diff_line("12", "The product should be designed to provide", "removed")
        rm2 = self._diff_line("13", "users with a comprehensive set of tools", "removed")
        rm3 = self._diff_line("14", "that will enable them to accomplish goals.", "removed")

        # Added lines
        add1 = self._diff_line("12", "Ship tools that get out of the way.", "added")

        # Second chunk
        rm4 = self._diff_line("16", "It is important that the interface is", "removed")
        rm5 = self._diff_line("17", "intuitive and easy to understand.", "removed")
        add2 = self._diff_line("16", "If it needs a tutorial, redesign it.", "added")

        removed1 = Group(rm1, rm2, rm3).arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        added1 = Group(add1).arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        added1.next_to(removed1, DOWN, buff=0.08, aligned_edge=LEFT)

        chunk1 = Group(removed1, added1)

        removed2 = Group(rm4, rm5).arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        added2_g = Group(add2).arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        added2_g.next_to(removed2, DOWN, buff=0.08, aligned_edge=LEFT)

        chunk2 = Group(removed2, added2_g)

        diff = Group(chunk1, chunk2).arrange(DOWN, buff=0.35, aligned_edge=LEFT)
        diff.move_to(panel.get_center() + UP * 0.3)

        # Animate diff appearing
        self.play(
            LaggedStart(
                *[FadeIn(line, shift=LEFT * 0.2) for line in [rm1, rm2, rm3]],
                lag_ratio=0.15, run_time=1.0
            )
        )
        self.wait(0.3)

        self.add_subcaption("Red for removed, green for added", duration=2.5)
        self.play(FadeIn(add1, shift=LEFT * 0.2), run_time=FAST)
        self.wait(0.5)

        self.play(
            LaggedStart(
                FadeIn(rm4, shift=LEFT * 0.2),
                FadeIn(rm5, shift=LEFT * 0.2),
                lag_ratio=0.15, run_time=0.8
            )
        )
        self.play(FadeIn(add2, shift=LEFT * 0.2), run_time=FAST)
        self.wait(0.5)

        # Approval buttons
        btn_accept = self._button("Accept", GREEN, "#1a3a25")
        btn_reject = self._button("Reject", RED, "#3a1a1a")
        btn_revise = self._button("Revise", PRIMARY, "#1a1a3a")

        buttons = Group(btn_accept, btn_reject, btn_revise).arrange(RIGHT, buff=0.3)
        buttons.next_to(diff, DOWN, buff=0.4)

        self.add_subcaption("Accept, reject, or revise each change", duration=3)
        self.play(
            LaggedStart(
                FadeIn(btn_accept, shift=UP * 0.15),
                FadeIn(btn_reject, shift=UP * 0.15),
                FadeIn(btn_revise, shift=UP * 0.15),
                lag_ratio=0.15, run_time=0.8
            )
        )
        self.wait(1.0)

        # Accept animation: flash green on accept button
        flash_rect = SurroundingRectangle(
            btn_accept, color=GREEN, buff=0.05,
            corner_radius=0.1, stroke_width=3
        )
        self.add_subcaption("You stay in control", duration=2)
        self.play(Create(flash_rect), run_time=0.4)
        self.play(
            FadeOut(flash_rect),
            # Fade out removed lines, keep added
            rm1.animate.set_opacity(0.15),
            rm2.animate.set_opacity(0.15),
            rm3.animate.set_opacity(0.15),
            rm4.animate.set_opacity(0.15),
            rm5.animate.set_opacity(0.15),
            run_time=NORMAL
        )
        self.wait(1.0)

        self.play(FadeOut(Group(*self.mobjects)), run_time=FAST)
        self.wait(0.3)

    def _diff_line(self, num, text, kind):
        num_text = Text(num, font_size=16, color=MUTED, font=MONO)
        num_text.set_opacity(0.4)

        if kind == "removed":
            content = Text(text, font_size=18, color=RED, font=MONO)
            bg = RoundedRectangle(
                corner_radius=0.06,
                width=content.width + 0.3,
                height=content.height + 0.15,
                fill_color=RED, fill_opacity=0.1,
                stroke_width=0
            )
            # strikethrough line
            strike = Line(
                content.get_left(), content.get_right(),
                color=RED, stroke_width=1.5, stroke_opacity=0.6
            )
            content_group = Group(bg, content, strike)
            bg.move_to(content)
            strike.move_to(content)
        else:
            content = Text(text, font_size=18, color=GREEN, font=MONO)
            bg = RoundedRectangle(
                corner_radius=0.06,
                width=content.width + 0.3,
                height=content.height + 0.15,
                fill_color=GREEN, fill_opacity=0.1,
                stroke_width=0
            )
            content_group = Group(bg, content)
            bg.move_to(content)

        row = Group(num_text, content_group).arrange(RIGHT, buff=0.3)
        return row

    def _button(self, label, color, bg_color):
        bg = RoundedRectangle(
            corner_radius=0.12, width=1.8, height=0.55,
            fill_color=bg_color, fill_opacity=1,
            stroke_color=color, stroke_width=1, stroke_opacity=0.3
        )
        text = Text(label, font_size=18, color=color, font=MONO, weight=BOLD)
        text.move_to(bg)
        return Group(bg, text)


class Scene4_History(Scene):
    def construct(self):
        self.camera.background_color = BG

        label = Text("VERSION HISTORY", font_size=16, color=PRIMARY, font=MONO, weight=BOLD)
        label.to_edge(UP, buff=0.6)

        heading = Text(
            "Every save is a commit",
            font_size=34, color=FG, weight=BOLD, font=MONO
        )
        heading.next_to(label, DOWN, buff=0.35)

        self.add_subcaption("Every save is a commit", duration=2)
        self.play(FadeIn(label), Write(heading), run_time=NORMAL)
        self.wait(0.5)

        # Timeline
        entries = [
            ("Tightened introduction", "Just now", PRIMARY, "Claude edit"),
            ("Added technical requirements", "5m ago", GREEN, "Saved"),
            ("Rewrote goals section", "12m ago", PRIMARY, "Claude edit"),
            ("Submitted for review", "Yesterday", "#fdb022", "PR #14"),
            ("Initial draft", "2 days ago", GREEN, "Saved"),
        ]

        timeline_items = []
        for title, time, dot_color, badge_text in entries:
            dot = Dot(radius=0.1, color=dot_color)

            title_text = Text(title, font_size=20, color=FG, font=MONO)

            badge_bg = RoundedRectangle(
                corner_radius=0.08, height=0.3,
                width=len(badge_text) * 0.13 + 0.3,
                fill_color=dot_color, fill_opacity=0.15,
                stroke_width=0
            )
            badge_label = Text(badge_text, font_size=14, color=dot_color, font=MONO, weight=BOLD)
            badge_label.move_to(badge_bg)
            badge = Group(badge_bg, badge_label)

            title_row = Group(title_text, badge).arrange(RIGHT, buff=0.25)

            time_text = Text(time, font_size=15, color=MUTED, font=MONO)
            info = Group(title_row, time_text).arrange(DOWN, buff=0.08, aligned_edge=LEFT)

            item = Group(dot, info).arrange(RIGHT, buff=0.3)
            item.dot = dot
            timeline_items.append(item)

        timeline = Group(*timeline_items).arrange(DOWN, buff=0.35, aligned_edge=LEFT)
        timeline.next_to(heading, DOWN, buff=0.6)

        # Draw connecting line segments between dots
        connectors = VGroup()
        for i in range(len(timeline_items) - 1):
            d1 = timeline_items[i].dot
            d2 = timeline_items[i + 1].dot
            conn = Line(
                d1.get_bottom(), d2.get_top(),
                color=FAINT, stroke_width=2
            )
            connectors.add(conn)

        self.add_subcaption("Full version history with git", duration=3)
        self.play(
            LaggedStart(
                *[
                    AnimationGroup(
                        FadeIn(item, shift=RIGHT * 0.3),
                        *(
                            [Create(connectors[i])]
                            if i < len(connectors) else []
                        )
                    )
                    for i, item in enumerate(timeline_items)
                ],
                lag_ratio=0.2, run_time=3.0
            )
        )
        self.wait(1.5)

        # Highlight restore ability
        restore_arrow = Arrow(
            timeline_items[3].get_right() + RIGHT * 0.3,
            timeline_items[3].get_right() + RIGHT * 1.5,
            color=PRIMARY, stroke_width=2,
            max_tip_length_to_length_ratio=0.2
        )
        restore_text = Text("Restore", font_size=18, color=PRIMARY, font=MONO, weight=BOLD)
        restore_text.next_to(restore_arrow, RIGHT, buff=0.15)

        self.add_subcaption("Restore any previous version", duration=2)
        self.play(GrowArrow(restore_arrow), FadeIn(restore_text), run_time=FAST)
        self.wait(1.5)

        self.play(FadeOut(Group(*self.mobjects)), run_time=FAST)
        self.wait(0.3)


class Scene5_Vault(Scene):
    def construct(self):
        self.camera.background_color = BG

        label = Text("VAULT INTELLIGENCE", font_size=16, color=PRIMARY, font=MONO, weight=BOLD)
        label.to_edge(UP, buff=0.6)

        heading = Text(
            "Claude knows your whole library",
            font_size=34, color=FG, weight=BOLD, font=MONO
        )
        heading.next_to(label, DOWN, buff=0.35)

        self.add_subcaption("Claude knows your whole library", duration=2)
        self.play(FadeIn(label), Write(heading), run_time=NORMAL)
        self.wait(0.5)

        # Chat-style UI
        chat_panel = RoundedRectangle(
            corner_radius=0.2, width=10, height=3.5,
            fill_color=SURFACE, fill_opacity=1,
            stroke_color=FAINT, stroke_width=1
        ).shift(DOWN * 0.5)

        self.play(FadeIn(chat_panel), run_time=FAST)

        # User message with @mentions
        user_label = Text("You", font_size=14, color=MUTED, font=MONO, weight=BOLD)
        user_msg_parts = [
            Text("Summarize our auth. Ref ", font_size=18, color=FG, font=MONO),
        ]

        mention1_bg = RoundedRectangle(
            corner_radius=0.08, width=2.0, height=0.35,
            fill_color=PRIMARY, fill_opacity=0.12,
            stroke_width=0
        )
        mention1_text = Text("@architecture", font_size=16, color=PRIMARY, font=MONO, weight=BOLD)
        mention1_text.move_to(mention1_bg)
        mention1 = Group(mention1_bg, mention1_text)

        mention2_bg = RoundedRectangle(
            corner_radius=0.08, width=2.1, height=0.35,
            fill_color=PRIMARY, fill_opacity=0.12,
            stroke_width=0
        )
        mention2_text = Text("@docs/auth.md", font_size=16, color=PRIMARY, font=MONO, weight=BOLD)
        mention2_text.move_to(mention2_bg)
        mention2 = Group(mention2_bg, mention2_text)

        user_row = Group(user_msg_parts[0], mention1, mention2).arrange(RIGHT, buff=0.12)
        user_block = Group(user_label, user_row).arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        user_block.move_to(chat_panel.get_center() + UP * 0.9 + LEFT * 0.5)

        self.add_subcaption("Reference any document with @ mentions", duration=3)
        self.play(FadeIn(user_label), run_time=0.3)
        self.play(Write(user_msg_parts[0]), run_time=FAST)
        self.play(
            FadeIn(mention1, scale=0.9),
            FadeIn(mention2, scale=0.9),
            run_time=FAST
        )
        self.wait(0.5)

        # Claude response
        claude_label = Text("Claude", font_size=14, color=PRIMARY, font=MONO, weight=BOLD)
        claude_resp = Text(
            "Based on your architecture doc:\n"
            "Auth uses JWT tokens issued by the\n"
            "gateway. Tokens validated at the edge\n"
            "via middleware before reaching handlers.",
            font_size=17, color=FG, font=MONO, line_spacing=1.3
        )

        claude_block = Group(claude_label, claude_resp).arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        claude_block.next_to(user_block, DOWN, buff=0.4, aligned_edge=LEFT)

        self.add_subcaption("Claude responds with full context", duration=3)
        self.play(FadeIn(claude_label), run_time=0.3)
        self.play(Write(claude_resp), run_time=2.0)
        self.wait(1.5)

        self.play(FadeOut(Group(*self.mobjects)), run_time=FAST)
        self.wait(0.3)


class Scene6_Closing(Scene):
    def construct(self):
        self.camera.background_color = BG

        # Logo
        logo_bg = RoundedRectangle(
            corner_radius=0.25, width=1.6, height=1.6,
            fill_color=SURFACE, fill_opacity=1,
            stroke_color=PRIMARY, stroke_width=2
        )
        k_vert = Line(UP * 0.4, DOWN * 0.4, color=PRIMARY, stroke_width=5).shift(LEFT * 0.2)
        k_diag1 = Line(DOWN * 0.05 + LEFT * 0.2, UP * 0.4 + RIGHT * 0.25, color=PRIMARY, stroke_width=5)
        k_diag2 = Line(DOWN * 0.05 + LEFT * 0.2, DOWN * 0.4 + RIGHT * 0.25, color=PRIMARY, stroke_width=3.5)
        k_shape = VGroup(k_vert, k_diag1, k_diag2)
        logo = Group(logo_bg, k_shape).move_to(UP * 1.0)

        title = Text("komma", font_size=48, color=FG, weight=BOLD, font=MONO)
        title.next_to(logo, DOWN, buff=0.4)

        tagline = Text(
            "Free & open source",
            font_size=24, color=MUTED, font=MONO
        )
        tagline.next_to(title, DOWN, buff=0.25)

        cta_bg = RoundedRectangle(
            corner_radius=0.15, width=4.5, height=0.65,
            fill_color=PRIMARY, fill_opacity=1,
            stroke_width=0
        )
        cta_text = Text("Download for macOS", font_size=20, color=WHITE, font=MONO, weight=BOLD)
        cta_text.move_to(cta_bg)
        cta = Group(cta_bg, cta_text)
        cta.next_to(tagline, DOWN, buff=0.5)

        note = Text(
            "macOS 12+ -- Uses your Claude subscription",
            font_size=16, color=MUTED, font=MONO
        )
        note.next_to(cta, DOWN, buff=0.25)

        self.add_subcaption("Free and open source", duration=2)
        self.play(
            FadeIn(logo, scale=0.8),
            Write(title),
            run_time=NORMAL
        )
        self.wait(0.3)

        self.play(FadeIn(tagline, shift=UP * 0.15), run_time=FAST)
        self.wait(0.3)

        self.add_subcaption("Download for macOS", duration=2)
        self.play(FadeIn(cta, scale=0.95), run_time=FAST)
        self.play(FadeIn(note, shift=UP * 0.1), run_time=0.4)
        self.wait(2.0)

        self.play(FadeOut(Group(*self.mobjects)), run_time=NORMAL)
        self.wait(0.5)
