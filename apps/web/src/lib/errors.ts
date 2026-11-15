import { ApiError } from './api';

/** Arabic text for every error code the API returns. One place, used by every screen. */
const MESSAGES: Record<string, string> = {
  NETWORK: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.',
  SERVER: 'حدث خطأ غير متوقع. حاول بعد قليل.',
  VALIDATION: 'بعض البيانات غير صحيحة. راجع الحقول.',
  AUTH_REQUIRED: 'سجّل الدخول للمتابعة.',
  TOKEN_INVALID: 'انتهت الجلسة. سجّل الدخول من جديد.',
  INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  EMAIL_TAKEN: 'هذا البريد مسجّل مسبقاً.',
  ROLE_NOT_ALLOWED: 'هذا الإجراء غير متاح لحسابك.',
  ORG_NOT_VERIFIED: 'حسابك قيد التحقق. ستتمكن من ذلك بعد تفعيله.',
  ORG_SUSPENDED: 'حسابك موقوف. تواصل مع فريق FoodCycle.',
  UNKNOWN_CATEGORY: 'تصنيف غير معروف.',
  OFFER_RULES_VIOLATED: 'العرض لا يحقق شروط سلامة الغذاء.',
  OFFER_NOT_FOUND: 'العرض غير موجود أو لم يعد متاحاً.',
  OFFER_LOCKED: 'لا يمكن تعديل عرض بدأ حجزه.',
  OFFER_NOT_CANCELLABLE: 'لا يمكن إلغاء هذا العرض الآن.',
  OFFER_NOT_AVAILABLE: 'العرض محجوز بالكامل.',
  OFFER_EXPIRING: 'لم يعد هناك وقت كافٍ لاستلام هذا العرض.',
  INSUFFICIENT_QUANTITY: 'الكمية المطلوبة أكبر من المتاح.',
  ALREADY_CLAIMED: 'لديكم طلب نشط على هذا العرض.',
  TOO_MANY_ACTIVE_CLAIMS: 'وصلتم للحد الأقصى من الحجوزات النشطة. أكملوا أو ألغوا حجزاً أولاً.',
  CLAIM_NOT_FOUND: 'الطلب غير موجود.',
  CLAIM_NOT_ACTIVE: 'هذا الطلب لم يعد نشطاً.',
  CLAIM_NOT_PENDING: 'تم البت في هذا الطلب مسبقاً.',
  APPROVAL_WINDOW_CLOSED: 'انتهت مهلة الموافقة على هذا الطلب.',
  PICKUP_CODE_INVALID: 'الرمز غير صحيح أو مستخدم مسبقاً.',
  NOT_PICKED_UP: 'يمكن التقييم بعد الاستلام فقط.',
  ALREADY_RATED: 'قيّمتم هذه العملية مسبقاً.',
  RATING_WINDOW_CLOSED: 'انتهت مدة التقييم.',
  STATUS_UNCHANGED: 'الحالة لم تتغير.',
  REASON_REQUIRED: 'اذكر سبب الإيقاف.',
  INVALID_THRESHOLDS: 'عتبة "حرج" يجب أن تكون أقل من "قريب".',
};

/** Food-safety rule violations returned with OFFER_RULES_VIOLATED */
export const VIOLATION_TEXT: Record<string, string> = {
  PREPARED_IN_FUTURE: 'وقت التحضير في المستقبل.',
  READY_BEFORE_PREPARED: 'وقت الجاهزية قبل وقت التحضير.',
  PICKUP_NOT_AFTER_READY: 'آخر موعد للاستلام يجب أن يكون بعد وقت الجاهزية.',
  PICKUP_TOO_FAR: 'آخر موعد للاستلام أبعد من 30 يوماً.',
  ALLERGENS_NOT_DECLARED: 'أكّد مسببات الحساسية (حتى لو لا يوجد).',
  STORAGE_NEEDS_TEMPERATURE_CONTROL: 'هذا الصنف يحتاج حفظاً مبرّداً أو ساخناً، لا بحرارة الغرفة.',
  TOO_CLOSE_TO_EXPIRY: 'لا يكفي الوقت المتبقي لنقل الطعام بأمان.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'OFFER_RULES_VIOLATED' && Array.isArray(e.body.violations)) {
      return (e.body.violations as string[]).map((v) => VIOLATION_TEXT[v] ?? v).join(' ');
    }
    if (e.code === 'INSUFFICIENT_QUANTITY' && typeof e.body.remainingKg === 'number') {
      return `الكمية المتاحة ${e.body.remainingKg} كغ فقط.`;
    }
    return MESSAGES[e.code] ?? (typeof e.body.message === 'string' ? e.body.message : MESSAGES.SERVER);
  }
  return MESSAGES.SERVER;
}
