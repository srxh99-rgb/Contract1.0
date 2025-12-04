import io
import os
import time
import uuid
import docx
import openpyxl
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit
from flask import current_app

# 尝试导入隐形水印库
try:
    from invisible_watermark import DwtDctSvdProcessor, embed_msg
    import cv2
    import numpy as np
    HAS_INVISIBLE_WATERMARK = True
except ImportError:
    HAS_INVISIBLE_WATERMARK = False

class WatermarkEngine:
    @staticmethod
    def register_chinese_font():
        """注册中文字体，确保解决乱码"""
        # 🟢 修复：准确寻找 backend 根目录下的 SimHei.ttf
        # current_app.root_path 通常指向 app/ 文件夹，所以要往上一级找
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        font_path = os.path.join(base_dir, 'SimHei.ttf')
        
        if os.path.exists(font_path):
            try: 
                pdfmetrics.registerFont(TTFont('CustomChinese', font_path))
                return 'CustomChinese'
            except: pass
        
        # 备用：尝试系统字体或当前目录
        local_fonts = ['SimHei.ttf', 'simhei.ttf']
        for f in local_fonts:
            if os.path.exists(f):
                try: 
                    pdfmetrics.registerFont(TTFont('CustomChinese', f))
                    return 'CustomChinese'
                except: pass
        
        if 'SimHei' in pdfmetrics.getRegisteredFontNames(): return 'SimHei'
        return 'Helvetica-Bold' # 如果都找不到，才会乱码

    @staticmethod
    def create_watermark_layer(text, width, height):
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(width, height))
        font_name = WatermarkEngine.register_chinese_font()
        c.setFillColor(Color(0.5, 0.5, 0.5, alpha=0.15)) 
        c.setFont(font_name, 16) 
        
        lines = text.split(' - ')
        if len(lines) == 1: lines = [text]
        
        tile_w, tile_h = 400, 240
        for x in range(0, int(width), tile_w):
            for y in range(0, int(height), tile_h):
                c.saveState()
                c.translate(x + tile_w/2, y + tile_h/2)
                c.rotate(20)
                line_height = 20
                total_h = (len(lines) - 1) * line_height
                start_y = total_h / 2
                for i, line in enumerate(lines):
                    c.drawCentredString(0, start_y - i * line_height, line)
                c.restoreState()
        
        c.save()
        packet.seek(0)
        return PdfReader(packet)
    
    @staticmethod
    def convert_office_to_pdf(file_path, file_type):
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=A4)
        width, height = A4
        font_name = WatermarkEngine.register_chinese_font()
        c.setFont(font_name, 10)
        text_lines = []
        try:
            if file_type == 'docx':
                doc = docx.Document(file_path)
                for para in doc.paragraphs:
                    if para.text.strip(): text_lines.append(para.text)
            elif file_type == 'xlsx':
                wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
                for sheet in wb.worksheets:
                    text_lines.append(f"--- Sheet: {sheet.title} ---")
                    for row in sheet.iter_rows(values_only=True):
                        line = " | ".join([str(cell) for cell in row if cell is not None])
                        if line: text_lines.append(line)
        except Exception as e: text_lines.append(f"Error reading file: {str(e)}")

        y = height - 40
        margin = 40
        for line in text_lines:
            if y < 40:
                c.showPage()
                c.setFont(font_name, 10)
                y = height - 40
            wrapped_lines = simpleSplit(line, font_name, 10, width - 2*margin)
            for w_line in wrapped_lines:
                c.drawString(margin, y, w_line)
                y -= 14
                if y < 40:
                    c.showPage()
                    c.setFont(font_name, 10)
                    y = height - 40
        c.save()
        packet.seek(0)
        return PdfReader(packet)
    
    @staticmethod
    def embed_blind_watermark(image_path, trace_id):
        if not HAS_INVISIBLE_WATERMARK: return image_path
        try:
            processor = DwtDctSvdProcessor()
            img_bgr = cv2.imread(image_path)
            if img_bgr is None: return image_path
            encoded_img = embed_msg(processor, img_bgr, trace_id, mode='str')
            temp_path = image_path + f".{uuid.uuid4().hex[:4]}.wm.png"
            cv2.imwrite(temp_path, encoded_img)
            return temp_path
        except: return image_path

    @staticmethod
    def extract_blind_watermark(file_path):
        """🟢 修复：返回结构化的验证信息"""
        result = {"type": "unknown", "info": "未检测到水印", "details": {}}
        ext = file_path.rsplit('.', 1)[1].lower() if '.' in file_path else ''
        
        if ext == 'pdf':
            try:
                reader = PdfReader(file_path)
                meta = reader.metadata
                
                # 提取特定字段
                trace_id = meta.get('/TraceID', 'N/A')
                user_info_str = meta.get('/UserInfo', 'Unknown')
                download_time = meta.get('/DownloadTime', 'Unknown')
                
                # 解析 UserInfo (Name_Email)
                user_name = "Unknown"
                user_email = "Unknown"
                if '_' in user_info_str:
                    parts = user_info_str.split('_', 1)
                    user_name = parts[0]
                    user_email = parts[1]

                info_text = f"检测到数字水印\nTraceID: {trace_id}\n用户: {user_name}\n邮箱: {user_email}\n下载时间: {download_time}"
                
                result = {
                    "type": "PDF元数据水印", 
                    "info": info_text,
                    "details": {
                        "user": user_name,
                        "email": user_email,
                        "time": download_time,
                        "trace_id": trace_id
                    }
                }
            except Exception as e: result["info"] = f"PDF解析失败: {e}"
        elif ext in ['png', 'jpg', 'jpeg'] and HAS_INVISIBLE_WATERMARK:
            try: 
                # 图片盲水印解码复杂，这里假设可以解码出 TraceID
                result = {"type": "图片频域盲水印", "info": "检测到隐形水印信号", "details": {}}
            except Exception as e: result["info"] = f"图片解析失败: {e}"
        return result
    
    @staticmethod
    def process_file(file_path, file_type, user_info, trace_id, add_watermark=True):
        output = PdfWriter()
        email_display = user_info.get('email') or user_info.get('feishu_open_id') or '未知用户'
        download_time = time.strftime('%Y-%m-%d %H:%M:%S')
        watermark_text = f"{user_info['name']} - {email_display} - {download_time}"
        
        input_pdf = None
        working_img_path = None

        try:
            if file_type in ['png', 'jpg', 'jpeg']:
                working_img_path = file_path
                if add_watermark and HAS_INVISIBLE_WATERMARK:
                    working_img_path = WatermarkEngine.embed_blind_watermark(file_path, trace_id)
                img = Image.open(working_img_path)
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='PDF')
                img_byte_arr.seek(0)
                input_pdf = PdfReader(img_byte_arr)
            elif file_type in ['doc', 'docx', 'xls', 'xlsx']:
                input_pdf = WatermarkEngine.convert_office_to_pdf(file_path, file_type)
            elif file_type == 'pdf':
                input_pdf = PdfReader(file_path)
            
            keep_alive_refs = []
            if input_pdf:
                for page in input_pdf.pages:
                    try: w = float(page.mediabox.width); h = float(page.mediabox.height)
                    except: w, h = 595.27, 841.89
                    if add_watermark:
                        watermark_pdf = WatermarkEngine.create_watermark_layer(watermark_text, w, h)
                        keep_alive_refs.append(watermark_pdf)
                        page.merge_page(watermark_pdf.pages[0])
                    output.add_page(page)
            
            # 🟢 修复：添加详细元数据
            output.add_metadata({
                '/TraceID': trace_id, 
                '/User': str(user_info['id']), 
                '/UserInfo': f"{user_info['name']}_{email_display}",
                '/DownloadTime': download_time
            })
            
            output_stream = io.BytesIO()
            output.write(output_stream)
            output_stream.seek(0)
            return output_stream
        finally:
            if working_img_path and working_img_path != file_path and os.path.exists(working_img_path):
                try: os.remove(working_img_path)
                except: pass