from pathlib import Path
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import pypdfium2 as pdfium

ROOT=Path(__file__).parent
OUT=ROOT/'dist'/'assets'
SOURCE=Path(r'C:/Users/samfl/Desktop/Inventory - 21a Northwood Park Road.pdf')
SIGNATURE=Path(r'C:/Users/samfl/AppData/Local/Temp/codex-clipboard-01087528-7fbb-4c82-a1cf-8d98636c6c4b.png')
pdfmetrics.registerFont(TTFont('Arial',r'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold',r'C:/Windows/Fonts/arialbd.ttf'))
reader=PdfReader(SOURCE)
w,h=map(float,[reader.pages[0].mediabox.width,reader.pages[0].mediabox.height])
buffer=BytesIO(); c=canvas.Canvas(buffer,pagesize=(w,h))
c.setFillColorRGB(.153,.031,.239);c.rect(0,h-103,w,103,fill=1,stroke=0)
c.drawImage(str(OUT/'logo-light.png'),28,h-75,width=160,height=49,preserveAspectRatio=True,anchor='c',mask='auto')
c.setFont('Arial',8.8);c.setFillColorRGB(1,1,1)
for i,t in enumerate(['Creative Industries Centre,','Wolverhampton Science Park,','Wolverhampton, WV10 9TG']):c.drawString(443,h-40-i*12,t)
c.setFillColorRGB(0,0,0)
def center(text,y,size=14,bold=False):
 c.setFont('Arial-Bold' if bold else 'Arial',size);c.drawCentredString(w/2,y,text)
center('Photographic Inventory Document',h-138,17,True)
center('Inventory Conducted by: Sam Fleming on behalf of',h-164,12,True)
center('Fleming Lettings and Developments UK Ltd',h-189,14,True)
center('Dated: 21st September 2026',h-215,12,True)
center('By signing below, I/we hereby confirm this inventory is a true and accurate representation of the',h-278,10.6)
center('property 21a Northwood Park Road, Wolverhampton, WV10 8EU on 21st September 2026.',h-292,10.6)
x=58; widths=[160,160,160]; top=454; row=[28,62,28,62]; total=sum(row)
c.setStrokeColorRGB(.15,.12,.17);c.setLineWidth(.5);c.rect(x,top-total,sum(widths),total)
for vx in [x+160,x+320]:c.line(vx,top,vx,top-total)
cursor=top
for rh in row[:-1]:cursor-=rh;c.line(x,cursor,x+480,cursor)
c.setFont('Arial',10)
for i,t in enumerate(['Agent name','Agent signature','Date signed']):c.drawCentredString(x+80+i*160,top-18,t)
c.drawString(x+10,top-61,'Sam Fleming')
c.drawImage(ImageReader(str(SIGNATURE)),x+212,top-85,width=46,height=52,preserveAspectRatio=True,mask='auto')
c.drawCentredString(x+400,top-61,'28/09/2026')
for i,t in enumerate(['Tenant name','Tenant signature','Date signed']):c.drawCentredString(x+80+i*160,top-108,t)
c.setFont('Arial',9.6);c.drawString(x+7,top-143,'Mr. William Alan Rushforth')
c.setFont('Arial',9);c.setFillColorRGB(.46,.41,.49)
# Tenant signature remains blank for the request signing field.
# Tenant date remains blank for the request signing field.
c.setFont('Arial',8);c.setFillColorRGB(.67,0,.33)
c.drawCentredString(w/2,top-total-28,'TEST SIGNING COPY - not evidence of a completed tenant signature')
c.setStrokeColorRGB(.86,0,.43);c.line(28,47,w-28,47)
c.setFont('Arial',8);c.setFillColorRGB(.153,.031,.239)
c.drawString(28,31,'01902 212 415');c.drawCentredString(w/2,31,'fleminglettings.co.uk');c.drawRightString(w-28,31,'enquiries@fleminglettings.co.uk')
c.save();buffer.seek(0)
writer=PdfWriter();writer.add_page(PdfReader(buffer).pages[0])
for page in reader.pages[1:]:writer.add_page(page)
writer.add_metadata({'/Title':'Inventory - 21a Northwood Park Road - signing test','/Author':'Fleming Lettings','/Subject':'Test signing copy. Original inspection date retained; agent signature applied 28 September 2026.'})
target=OUT/'inventory-signing-test.pdf'
with target.open('wb') as f:writer.write(f)
doc=pdfium.PdfDocument(str(target));doc[0].render(scale=1.8).to_pil().save(OUT/'inventory-front-page.png')
check=PdfReader(target)
assert len(check.pages)==17
assert 'Sam Fleming' in check.pages[0].extract_text() and 'Marie Ellis' not in check.pages[0].extract_text()
for i in range(1,17):assert check.pages[i].extract_text()==reader.pages[i].extract_text()
print({'pages':len(check.pages),'source_pages_preserved':16,'output':str(target),'page_one_fonts':[str(v.get_object().get('/BaseFont')) for v in check.pages[0]['/Resources']['/Font'].values()]})


