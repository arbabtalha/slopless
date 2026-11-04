#!/usr/bin/env python3
"""Rebuild original Slopless icons and share image. Maintenance only.
Install Pillow and fonttools[woff] (see requirements-assets.txt).
"""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
BLUE, INK, CANVAS = '#244bf3', '#17212a', '#f8f9fb'

def font(size, weight=600):
    f = TTFont(SITE / 'assets/fonts/manrope-latin.woff2')
    # Instantiate the same locally shipped variable font used by the website.
    from fontTools.varLib.instancer import instantiateVariableFont
    f = instantiateVariableFont(f, {'wght': weight}, inplace=True)
    f.flavor = None
    stream = BytesIO()
    f.save(stream)
    stream.seek(0)
    return ImageFont.truetype(stream, size)

def mark(draw, x, y, size, color=BLUE):
    points = [(5,5),(27,5),(27,12),(12,12),(12,16),(27,16),(27,27),(5,27),(5,20),(20,20),(20,16),(5,16)]
    draw.polygon([(x + px * size / 32, y + py * size / 32) for px,py in points], fill=color)

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#244bf3"/><path d="M5 5h22v7H12v4h15v11H5v-7h15v-4H5z" fill="#fff"/></svg>\n'
(SITE / 'favicon.svg').write_text(svg)
icon = Image.new('RGB', (256,256), BLUE)
mark(ImageDraw.Draw(icon), 0, 0, 256, '#ffffff')
icon.save(SITE / 'favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])
icon.resize((180,180), Image.Resampling.LANCZOS).save(SITE / 'apple-touch-icon.png')
im = Image.new('RGB', (1200,630), CANVAS)
d = ImageDraw.Draw(im)
# A deliberately geometric design note, not a screenshot of the predecessor.
d.rectangle((900,0,1200,630), fill='#e9eef9')
for x in range(922,1200,28):
    for y in range(18,630,28): d.ellipse((x,y,x+2,y+2), fill='#b7c5e2')
mark(d, 63, 46, 44)
d.text((117,47), 'slopless.', font=font(35,800), fill=INK)
d.text((67,178), 'Less default.', font=font(83,750), fill=INK)
d.text((67,281), 'More deliberate.', font=font(83,750), fill=BLUE)
d.text((71,435), 'A design toolkit for your coding agent.', font=font(27,500), fill='#586471')
d.line((72,528,835,528), fill='#cdd5df', width=2)
d.text((72,553), '50 visual materials.  Open source.  Yours to shape.', font=font(20,500), fill='#586471')
mark(d, 930, 236, 230)
im.save(SITE / 'og-slopless.png', optimize=True)
print('Built favicon.svg, favicon.ico, apple-touch-icon.png, og-slopless.png')
