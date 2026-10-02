#!/usr/bin/env python3
"""Render BeSmart's app icons into public/icons/, in floatingsphere's style.

A ring of four segments (the Growth Garden attributes, in floatingsphere's status
colors) around a glass disc holding the summit: mountain + amber flag.

iOS ignores SVG touch icons and rounds the corners itself, so the PNGs are
full-bleed squares. icon.svg (the favicon) is written by hand to match; keep them
in step. Re-run after changing the look: python3 scripts/make_icons.py
"""
import math
import os

import cairo

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'icons')
BG = (0.051, 0.055, 0.075)        # page background #0d0e13
GLASS = (0.08, 0.09, 0.13)
INK = (0.93, 0.94, 0.96)          # #edf0f5
AMBER = (0.98, 0.75, 0.25)        # #fabf40
# Wisdom, Health, Capability, Wealth
SEGMENTS = [(0.66, 0.33, 0.97), (0.12, 0.66, 0.45), (0.22, 0.53, 0.90), AMBER]


def draw(size, path):
    s = cairo.ImageSurface(cairo.FORMAT_RGB24, size, size)
    cr = cairo.Context(s)
    cr.scale(size / 100, size / 100)  # draw on a 100×100 grid
    cr.set_source_rgb(*BG)
    cr.paint()

    cx = cy = 50
    rw, R = 8, 34                     # ring width / radius; leaves room for iOS's corner mask
    r = R - rw / 2 - 5
    gap = math.radians(9)

    cr.set_line_width(rw)
    cr.set_line_cap(cairo.LINE_CAP_BUTT)
    for i, color in enumerate(SEGMENTS):
        start = -math.pi / 2 + i * math.pi / 2 + gap / 2
        cr.set_source_rgb(*color)
        cr.arc(cx, cy, R, start, start + math.pi / 2 - gap)
        cr.stroke()

    # glass disc
    cr.arc(cx, cy, r, 0, 2 * math.pi)
    cr.set_source_rgb(*GLASS)
    cr.fill_preserve()
    cr.save()
    cr.clip()

    # mountain: steady climb to a summit (same shape as the old icon, scaled in)
    cy += 2                           # optically center mountain + flag in the disc
    base = cy + r * 0.52
    cr.move_to(cx - r * 0.78, base)
    cr.line_to(cx - r * 0.24, cy - r * 0.08)
    cr.line_to(cx - r * 0.02, cy + r * 0.18)
    cr.line_to(cx + r * 0.24, cy - r * 0.36)
    cr.line_to(cx + r * 0.78, base)
    cr.close_path()
    cr.set_source_rgb(*INK)
    cr.fill()

    # summit flag
    fx, fy = cx + r * 0.24, cy - r * 0.36
    cr.set_line_width(1.8)
    cr.set_line_cap(cairo.LINE_CAP_ROUND)
    cr.move_to(fx, fy)
    cr.line_to(fx, fy - r * 0.34)
    cr.stroke()
    cr.move_to(fx + 0.6, fy - r * 0.34)
    cr.line_to(fx + r * 0.3, fy - r * 0.25)
    cr.line_to(fx + 0.6, fy - r * 0.16)
    cr.close_path()
    cr.set_source_rgb(*AMBER)
    cr.fill()

    cy -= 2
    # soft highlight, upper left
    g = cairo.RadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.7)
    g.add_color_stop_rgba(0, 1, 1, 1, 0.14)
    g.add_color_stop_rgba(1, 1, 1, 1, 0)
    cr.set_source(g)
    cr.paint()
    cr.restore()
    cr.set_line_width(0.8)
    cr.set_source_rgba(1, 1, 1, 0.28)
    cr.arc(cx, cy, r, 0, 2 * math.pi)
    cr.stroke()

    s.write_to_png(os.path.join(OUT, path))


if __name__ == '__main__':
    for size, name in ((180, 'icon-180.png'), (192, 'icon-192.png'), (512, 'icon-512.png'), (32, 'favicon-32.png')):
        draw(size, name)
        print(name)
