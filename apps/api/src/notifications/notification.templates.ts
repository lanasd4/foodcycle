/**
 * Every notification type, its data, and its Arabic text.
 * Text is built on the server so the same message can later go out by SMS,
 * WhatsApp or Web Push without the client. The client also gets `type` and
 * `data` to build links and icons.
 */

const kg = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)} كغ`;

const ORG_TYPE_LABEL: Record<string, string> = {
  RESTAURANT: 'مطعم',
  HOTEL: 'فندق',
  BAKERY: 'مخبز',
  GROCERY: 'متجر غذائي',
  CHARITY: 'جمعية خيرية',
  HUMANITARIAN: 'مؤسسة إنسانية',
};

export interface NotificationData {
  'offer.new_match': { offerId: string; title: string; donorName: string; quantityKg: number; area: string };
  'offer.expired': { offerId: string; title: string; remainingKg: number };
  'claim.pending_approval': { claimId: string; offerId: string; title: string; charityName: string; quantityKg: number; minutesToAnswer: number };
  'claim.reserved': { claimId: string; offerId: string; title: string; charityName: string; quantityKg: number };
  'claim.approved': { claimId: string; offerId: string; title: string; donorName: string; quantityKg: number; minutesToPickup: number };
  'claim.rejected': { claimId: string; offerId: string; title: string; donorName: string; reason: string | null };
  'claim.approval_timeout.charity': { claimId: string; offerId: string; title: string; donorName: string };
  'claim.approval_timeout.donor': { claimId: string; offerId: string; title: string; charityName: string };
  'claim.expired.charity': { claimId: string; offerId: string; title: string };
  'claim.expired.donor': { claimId: string; offerId: string; title: string; charityName: string; quantityKg: number };
  'claim.cancelled_by_charity': { claimId: string; offerId: string; title: string; charityName: string; quantityKg: number };
  'claim.cancelled_by_donor': { claimId: string; offerId: string; title: string; donorName: string };
  'claim.picked_up': { claimId: string; offerId: string; title: string; quantityKg: number };
  'rating.received': { claimId: string; fromName: string; score: number; title: string };
  'org.pending_verification': { orgId: string; name: string; type: string };
  'org.verified': { orgId: string };
  'org.suspended': { orgId: string; reason: string | null };
  'org.reactivated': { orgId: string };
}
export type NotificationType = keyof NotificationData;

type Renderers = { [T in NotificationType]: (d: NotificationData[T]) => { title: string; body: string } };

const RENDER: Renderers = {
  'offer.new_match': (d) => ({
    title: 'عرض جديد مناسب لكم',
    body: `${d.donorName} نشر «${d.title}» (${kg(d.quantityKg)}) في ${d.area}.`,
  }),
  'offer.expired': (d) => ({
    title: 'انتهى عرضك',
    body: `انتهت صلاحية «${d.title}»${d.remainingKg > 0 ? ` وبقي منه ${kg(d.remainingKg)} دون حجز` : ''}.`,
  }),
  'claim.pending_approval': (d) => ({
    title: 'طلب استلام بانتظار موافقتك',
    body: `${d.charityName} تطلب ${kg(d.quantityKg)} من «${d.title}». الرد خلال ${d.minutesToAnswer} دقيقة.`,
  }),
  'claim.reserved': (d) => ({
    title: 'تم حجز جزء من عرضك',
    body: `${d.charityName} حجزت ${kg(d.quantityKg)} من «${d.title}».`,
  }),
  'claim.approved': (d) => ({
    title: 'تمت الموافقة على طلبك',
    body: `وافق ${d.donorName} على ${kg(d.quantityKg)} من «${d.title}». الاستلام خلال ${d.minutesToPickup} دقيقة.`,
  }),
  'claim.rejected': (d) => ({
    title: 'تم رفض طلبك',
    body: `رفض ${d.donorName} طلب «${d.title}».${d.reason ? ` السبب: ${d.reason}` : ''}`,
  }),
  'claim.approval_timeout.charity': (d) => ({
    title: 'انتهت مهلة الموافقة',
    body: `لم يرد ${d.donorName} على طلبك لـ«${d.title}» في الوقت المحدد.`,
  }),
  'claim.approval_timeout.donor': (d) => ({
    title: 'فاتك طلب استلام',
    body: `انتهت مهلة الرد على طلب ${d.charityName} لـ«${d.title}»، وعادت الكمية للعرض.`,
  }),
  'claim.expired.charity': (d) => ({
    title: 'انتهت مدة الحجز',
    body: `لم يتم استلام «${d.title}» في الوقت المحدد، فأُلغي الحجز.`,
  }),
  'claim.expired.donor': (d) => ({
    title: 'لم تحضر الجمعية',
    body: `${d.charityName} لم تستلم ${kg(d.quantityKg)} من «${d.title}»، وعادت الكمية للعرض.`,
  }),
  'claim.cancelled_by_charity': (d) => ({
    title: 'ألغت جمعية حجزها',
    body: `${d.charityName} ألغت حجز ${kg(d.quantityKg)} من «${d.title}»، وعادت الكمية للعرض.`,
  }),
  'claim.cancelled_by_donor': (d) => ({
    title: 'أُلغي العرض',
    body: `ألغى ${d.donorName} عرض «${d.title}»، فأُلغي حجزك.`,
  }),
  'claim.picked_up': (d) => ({
    title: 'تم تأكيد الاستلام',
    body: `تم استلام ${kg(d.quantityKg)} من «${d.title}». شكراً لكم!`,
  }),
  'rating.received': (d) => ({
    title: 'وصلكم تقييم جديد',
    body: `قيّم ${d.fromName} عملية «${d.title}» بـ ${d.score} من 5.`,
  }),
  'org.pending_verification': (d) => ({
    title: 'جهة جديدة بانتظار التحقق',
    body: `${d.name} (${ORG_TYPE_LABEL[d.type] ?? d.type}) سجّلت وتنتظر المراجعة.`,
  }),
  'org.verified': () => ({
    title: 'تم تفعيل حسابك',
    body: 'تحقق فريق FoodCycle من بياناتك، ويمكنك الآن استخدام المنصة.',
  }),
  'org.suspended': (d) => ({
    title: 'تم إيقاف حسابك',
    body: d.reason ? `السبب: ${d.reason}` : 'تواصل مع فريق FoodCycle لمعرفة التفاصيل.',
  }),
  'org.reactivated': () => ({
    title: 'تمت إعادة تفعيل حسابك',
    body: 'يمكنك استخدام المنصة من جديد.',
  }),
};

export function renderNotification<T extends NotificationType>(type: T, data: NotificationData[T]) {
  return RENDER[type](data);
}
