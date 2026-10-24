import PDFDocument from 'pdfkit';
import logger from '../utils/logger.js';
import env from '../config/env.js';

export class PdfService {
  /**
   * Generates a tax invoice PDF buffer using PDFKit.
   */
  static async generateInvoicePdf(order: any, customer: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => {
          logger.error('Error during PDF document streaming', { metadata: { error: err.message } });
          reject(err);
        });

        // 1. Header
        doc.fillColor('#1F2937').fontSize(22).text(`${env.APP_NAME} PLATFORM`, 50, 50, { align: 'left' });
        doc.fontSize(10).fillColor('#6B7280').text('Premium Tailoring & Design Platform', 50, 75);
        
        doc.fontSize(18).fillColor('#111827').text('TAX INVOICE', 400, 50, { align: 'right' });
        doc.fontSize(10).fillColor('#4B5563').text(`Invoice #: ${order.invoiceNumber}`, 400, 75, { align: 'right' });
        doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 400, 90, { align: 'right' });

        doc.moveDown(2);
        
        // Horizontal Line
        doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, 115).lineTo(550, 115).stroke();

        // 2. Billing details
        const topOfBilling = 130;
        doc.fontSize(12).fillColor('#111827').text('Billed To:', 50, topOfBilling, { underline: true });
        doc.fontSize(10).fillColor('#4B5563')
          .text(`Name: ${customer.fullName}`, 50, topOfBilling + 20)
          .text(`Email: ${customer.email}`, 50, topOfBilling + 35)
          .text(`Phone: ${customer.phoneNumber}`, 50, topOfBilling + 50);

        doc.fontSize(12).fillColor('#111827').text('Payment Method:', 350, topOfBilling, { underline: true });
        doc.fontSize(10).fillColor('#4B5563')
          .text(`Method: ${order.paymentMethod}`, 350, topOfBilling + 20)
          .text(`Status: ${order.paymentStatus}`, 350, topOfBilling + 35)
          .text(`Transaction ID: ${order.transactionId || 'N/A'}`, 350, topOfBilling + 50);

        doc.moveDown(4);

        // 3. Itemized Table Header
        const tableTop = 230;
        doc.fillColor('#F3F4F6').rect(50, tableTop, 500, 20).fill();
        
        doc.fontSize(10).fillColor('#1F2937')
          .text('Product Name', 60, tableTop + 5)
          .text('Qty', 300, tableTop + 5, { width: 30, align: 'right' })
          .text('Price', 380, tableTop + 5, { width: 60, align: 'right' })
          .text('Total', 480, tableTop + 5, { width: 60, align: 'right' });

        // 4. Table Body
        let currentY = tableTop + 20;
        
        const items = order.orderItems || [];
        items.forEach((item: any) => {
          const addonLines = (item.selectedCustomizations || []).flatMap((group: any) =>
            (group.options || []).map((option: any) => `${group.name}: ${option.name}${Number(option.price) > 0 ? ` (+INR ${Number(option.price).toFixed(2)} each)` : ''}`)
          );
          doc.fontSize(10);
          const productNameHeight = doc.heightOfString(item.product.name, { width: 220 });
          const addonText = addonLines.length ? `Add-ons / selected options:\n${addonLines.join('\n')}` : '';
          doc.fontSize(8);
          const addonHeight = addonText ? doc.heightOfString(addonText, { width: 220 }) + 4 : 0;
          const rowHeight = Math.max(25, productNameHeight + addonHeight + 12);
          if (currentY + rowHeight > 680) {
            doc.addPage();
            currentY = 50;
          }
          doc.fillColor('#4B5563')
            .fontSize(10).text(item.product.name, 60, currentY + 5, { width: 220 })
            .text(item.quantity.toString(), 300, currentY + 5, { width: 30, align: 'right' })
            .text(`INR ${Number(item.price).toFixed(2)}`, 380, currentY + 5, { width: 60, align: 'right' })
            .text(`INR ${(Number(item.price) * item.quantity).toFixed(2)}`, 480, currentY + 5, { width: 60, align: 'right' });
          if (addonText) doc.fontSize(8).fillColor('#6B7280').text(addonText, 60, currentY + 7 + productNameHeight, { width: 220, lineGap: 1 });
          currentY += rowHeight;
          doc.strokeColor('#F3F4F6').lineWidth(0.5).moveTo(50, currentY).lineTo(550, currentY).stroke();
        });

        // 5. Total Calculations
        const calcTop = currentY + 20;
        doc.fontSize(10).fillColor('#1F2937')
          .text('Subtotal:', 350, calcTop, { width: 100, align: 'left' })
          .text(`INR ${Number(order.totalAmount).toFixed(2)}`, 470, calcTop, { width: 70, align: 'right' });

        doc.text('Tax Amount:', 350, calcTop + 15, { width: 100, align: 'left' })
          .text(`INR ${Number(order.taxAmount).toFixed(2)}`, 470, calcTop + 15, { width: 70, align: 'right' });

        doc.text('Discount Amount:', 350, calcTop + 30, { width: 100, align: 'left' })
          .text(`-INR ${Number(order.discountAmount).toFixed(2)}`, 470, calcTop + 30, { width: 70, align: 'right' });

        // Final Payable
        doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(350, calcTop + 50).lineTo(540, calcTop + 50).stroke();
        
        let currentCalcY = calcTop + 55;
        doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold')
          .text('Grand Total:', 350, currentCalcY, { width: 100, align: 'left' })
          .text(`INR ${Number(order.payableAmount).toFixed(2)}`, 470, currentCalcY, { width: 70, align: 'right' });
        doc.font('Helvetica');

        currentCalcY += 20;
        const advance = Number(order.advancePayment) || 0;
        const total = Number(order.payableAmount) || 0;
        const balance = Math.max(0, total - advance);

        doc.fontSize(10).fillColor('#4B5563')
          .text('Advance Paid:', 350, currentCalcY, { width: 100, align: 'left' })
          .text(`INR ${advance.toFixed(2)}`, 470, currentCalcY, { width: 70, align: 'right' });
        
        currentCalcY += 15;
        doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(350, currentCalcY).lineTo(540, currentCalcY).stroke();
        
        currentCalcY += 5;
        doc.fontSize(11).fillColor(balance > 0 ? '#DC2626' : '#059669').font('Helvetica-Bold')
          .text('Balance Due:', 350, currentCalcY, { width: 100, align: 'left' })
          .text(`INR ${balance.toFixed(2)}`, 470, currentCalcY, { width: 70, align: 'right' });
        doc.font('Helvetica');

        // 6. Footer
        doc.fontSize(8).fillColor('#9CA3AF').text(`Thank you for shopping with ${env.APP_NAME} Platform.`, 50, 700, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default PdfService;
