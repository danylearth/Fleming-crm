import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import type {PoolClient} from 'pg';
const root=process.env.UPLOADS_PATH || path.join(__dirname,'../uploads');
// App inventories remain immutable source evidence. Generated copies are linked to Documents.
export async function publishAppInventory(client:PoolClient,id:number,final=false):Promise<void> {
 const row=(await client.query('SELECT i.*,p.address,p.postcode,t.linked_tenant_id,t.tenancy_start_date FROM inventories i JOIN properties p ON p.id=i.property_id JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$1',[id])).rows[0];
 if(!row)return;
 const uploaded=(await client.query('SELECT inventory_id FROM inventory_documents WHERE inventory_id=$1',[id])).rows.length>0;
 if(uploaded)return;
 const reviews=(await client.query('SELECT * FROM inventory_reviews WHERE inventory_id=$1 ORDER BY id',[id])).rows;
 final=final || (reviews.length>0&&reviews.every(r=>r.signed_at));
 if(!final && (await client.query('SELECT id FROM documents WHERE inventory_id=$1 LIMIT 1',[id])).rows.length)return;
 if(final && (!reviews.length||reviews.some(r=>!r.signed_at)))return;
 const photos=(await client.query('SELECT p.*,r.room_name FROM inventory_photos p LEFT JOIN inventory_rooms r ON r.id=p.room_id WHERE p.inventory_id=$1 ORDER BY p.room_id,p.photo_order,p.id',[id])).rows;
 const rooms=(await client.query('SELECT room_name,notes FROM inventory_rooms WHERE inventory_id=$1 ORDER BY id',[id])).rows;
 const items=(await client.query('SELECT item.*,r.room_name FROM inventory_items item JOIN inventory_rooms r ON r.id=item.room_id WHERE r.inventory_id=$1 ORDER BY r.id,item.id',[id])).rows;
 const pdf=new PDFDocument({size:'A4',margin:40});const parts:Buffer[]=[];
 const done=new Promise<Buffer>((resolve,reject)=>{pdf.on('data',chunk=>parts.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(parts)));pdf.on('error',reject);});
 pdf.fontSize(20).text('Fleming Lettings - Property Inventory');pdf.moveDown().fontSize(12).text(row.address);pdf.text(`Inspection: ${new Date(row.inspection_date).toLocaleDateString('en-GB')}`);pdf.text(final?'Completed and signed by all listed tenants':'Completed inspection - awaiting tenant review');
 if(row.notes)pdf.moveDown().text(row.notes);
 for(const room of rooms)if(room.notes)pdf.moveDown().fontSize(12).text(room.room_name).fontSize(11).text(room.notes);
 for(const item of items){pdf.moveDown().fontSize(11).text(`${item.room_name || 'Room'}: ${item.item_name || item.name || 'Item'}`);if(item.condition)pdf.text(`Condition: ${item.condition}`);if(item.notes)pdf.text(item.notes);}
 for(const photo of photos){pdf.addPage().fontSize(14).text(photo.room_name || 'Inventory Photo');pdf.fontSize(11).text(photo.caption || '');const file=path.join(root,'inventory',path.basename(photo.filename));if(fs.existsSync(file))pdf.image(file,40,100,{fit:[515,570],align:'center'});}
 if(final)for(const review of reviews){pdf.addPage().fontSize(16).text(`Tenant Review: ${review.tenant_name}`);pdf.moveDown().fontSize(11).text(review.general_comments || 'No general comments');const comments=(await client.query('SELECT pr.comment,p.caption FROM inventory_photo_reviews pr JOIN inventory_photos p ON p.id=pr.photo_id WHERE pr.review_id=$1 AND pr.comment<>\'\'',[review.id])).rows;for(const c of comments)pdf.moveDown().text(`${c.caption || 'Photo'}: ${c.comment}`);const added=(await client.query('SELECT caption,data FROM inventory_tenant_photos WHERE review_id=$1 ORDER BY id',[review.id])).rows;for(const photo of added){pdf.addPage().fontSize(14).text(`Additional Photo: ${review.tenant_name}`).fontSize(11).text(photo.caption || '');pdf.image(photo.data,40,100,{fit:[515,570]});}pdf.moveDown().text(`Signed by: ${review.signature_name}`).text(`Signed at: ${new Date(review.signed_at).toISOString()}`);}
 pdf.end();const data=await done;const filename=`inventory/app-${id}-${crypto.randomUUID()}.pdf`;fs.mkdirSync(path.join(root,'inventory'),{recursive:true});fs.writeFileSync(path.join(root,filename),data,{mode:0o600});
 const name=`${final?'Signed Inventory':'Inventory'} - ${new Date(row.inspection_date).toISOString().slice(0,10)} - ${row.address}.pdf`;
 const entities=[{type:'property',id:row.property_id},{type:'tenant',id:row.tenant_id}];
 const partner=(await client.query('SELECT id FROM tenants WHERE id=$1 AND property_id=$2 AND tenancy_start_date IS NOT DISTINCT FROM $3',[row.linked_tenant_id,row.property_id,row.tenancy_start_date])).rows[0];if(partner)entities.push({type:'tenant',id:partner.id});
 for(const entity of entities)await client.query("INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status,inventory_id) VALUES($1,$2,'Inventory',$3,$4,'application/pdf',$5,'approved',$6) ON CONFLICT(inventory_id,entity_type,entity_id) WHERE inventory_id IS NOT NULL DO UPDATE SET filename=EXCLUDED.filename,original_name=EXCLUDED.original_name,size=EXCLUDED.size,uploaded_at=NOW()",[entity.type,entity.id,filename,name,data.length,id]);
}
