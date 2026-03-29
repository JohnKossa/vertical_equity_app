const PAGE = {
  margin: 15,
  usableWidth: 180,
  textMaxWidth: 170,
  imageHeight: 90,
  bodyFontSize: 11,
  titleFontSize: 14,
};

function ensureSpace(doc, cursorY, neededHeight) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - PAGE.margin) {
    doc.addPage();
    return PAGE.margin;
  }
  return cursorY;
}

function resolveJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error('jsPDF not found on window. Check jspdf.umd.min.js include path.');
}

async function drawChartSection(doc, section, cursorY) {
  const title = typeof section.title === 'string' ? section.title : '';
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PAGE.titleFontSize);
    cursorY = ensureSpace(doc, cursorY, 10);
    doc.text(title, PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
    cursorY += 8;
  }

  const chartNode = document.getElementById(section.plotlyDivId);
  if (!chartNode || !window.Plotly || typeof Plotly.toImage !== 'function') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PAGE.bodyFontSize);
    cursorY = ensureSpace(doc, cursorY, 7);
    doc.text(`Chart unavailable: ${title}`, PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
    return cursorY + 8;
  }

  try {
    const dataUrl = await Plotly.toImage(chartNode, {
      format: 'png',
      width: 900,
      height: 500,
    });
    const targetHeight = PAGE.imageHeight;
    const targetWidth = Math.min(PAGE.usableWidth, (900 / 500) * targetHeight);
    cursorY = ensureSpace(doc, cursorY, targetHeight);
    doc.addImage(dataUrl, 'PNG', PAGE.margin, cursorY, targetWidth, targetHeight);
    return cursorY + PAGE.imageHeight + 8;
  } catch (err) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PAGE.bodyFontSize);
    cursorY = ensureSpace(doc, cursorY, 7);
    doc.text(`Chart unavailable: ${title}`, PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
    return cursorY + 8;
  }
}

async function generatePDF(config) {
  const jsPDFCtor = resolveJsPDF();
  const doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  const sections = Array.isArray(config && config.sections) ? config.sections : [];
  const filename = (config && config.filename) ? config.filename : 'report.pdf';
  let cursorY = PAGE.margin;

  for (const section of sections) {
    if (!section || !section.type) continue;
    if (section.pageBreakBefore) {
      doc.addPage();
      cursorY = PAGE.margin;
    }

    if (section.type === 'text') {
      const isTitle = Boolean(section.isTitle);
      doc.setFont('helvetica', isTitle ? 'bold' : 'normal');
      doc.setFontSize(isTitle ? PAGE.titleFontSize : PAGE.bodyFontSize);
      const text = String(section.content || '');
      const wrapped = doc.splitTextToSize(text, PAGE.textMaxWidth);
      const lineHeight = isTitle ? 6 : 5.2;
      const estimatedHeight = Math.max(8, wrapped.length * lineHeight);
      cursorY = ensureSpace(doc, cursorY, estimatedHeight);
      doc.text(wrapped, PAGE.margin, cursorY, { maxWidth: PAGE.textMaxWidth });
      cursorY += estimatedHeight + 2;
      continue;
    }

    if (section.type === 'table') {
      const headers = Array.isArray(section.headers) ? section.headers : [];
      const rows = Array.isArray(section.rows) ? section.rows : [];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(PAGE.bodyFontSize);
      const tableOptions = {
        body: rows,
        startY: cursorY,
        margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin, bottom: PAGE.margin },
        styles: { font: 'helvetica', fontSize: PAGE.bodyFontSize },
        headStyles: { fontStyle: 'bold' },
        didDrawPage: (data) => {
          cursorY = data.cursor && data.cursor.y ? data.cursor.y : PAGE.margin;
        },
      };
      if (headers.length) {
        tableOptions.head = [headers];
      }
      doc.autoTable(tableOptions);
      cursorY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : cursorY) + 8;
      continue;
    }

    if (section.type === 'chart') {
      cursorY = await drawChartSection(doc, section, cursorY);
      continue;
    }

    if (section.type === 'image') {
      const title = typeof section.title === 'string' ? section.title : '';
      const dataUrl = typeof section.dataUrl === 'string' ? section.dataUrl : '';
      if (title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(PAGE.titleFontSize);
        cursorY = ensureSpace(doc, cursorY, 10);
        doc.text(title, PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
        cursorY += 8;
      }
      if (!dataUrl) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(PAGE.bodyFontSize);
        cursorY = ensureSpace(doc, cursorY, 7);
        doc.text('Image unavailable.', PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
        cursorY += 8;
        continue;
      }
      const imgW = Math.max(1, Number(section.imageWidth || 1200));
      const imgH = Math.max(1, Number(section.imageHeight || 700));
      const imageFormat = String(section.imageFormat || (dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG')).toUpperCase();
      const targetWidth = PAGE.usableWidth;
      const targetHeight = targetWidth * (imgH / imgW);
      cursorY = ensureSpace(doc, cursorY, targetHeight);
      try {
        console.info('[pdf-map] addImage diagnostics', {
          dataUrlLength: dataUrl.length,
          imageFormat,
          sourceWidth: imgW,
          sourceHeight: imgH,
          targetWidth,
          targetHeight
        });
        doc.addImage(dataUrl, imageFormat, PAGE.margin, cursorY, targetWidth, targetHeight);
        cursorY += targetHeight + 8;
      } catch (err) {
        console.warn('[pdf-map] addImage failed', err);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(PAGE.bodyFontSize);
        cursorY = ensureSpace(doc, cursorY, 7);
        doc.text('Map image could not be embedded in PDF.', PAGE.margin, cursorY, { maxWidth: PAGE.usableWidth });
        cursorY += 8;
      }
    }
  }

  doc.save(filename);
}

window.generatePDF = generatePDF;
