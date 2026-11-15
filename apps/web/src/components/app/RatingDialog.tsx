import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/feedback';
import { Field, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const LABELS = ['', 'سيئ', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز'];

/** Rate the other side of a completed pickup (once). */
export function RatingDialog({
  claimId,
  targetName,
  open,
  onOpenChange,
}: {
  claimId: string;
  targetName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const rate = useMutation({
    mutationFn: () => api.post(`/claims/${claimId}/rating`, { score, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'شكراً لتقييمكم' });
      void qc.invalidateQueries({ queryKey: ['claim', claimId] });
      void qc.invalidateQueries({ queryKey: ['claims'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`قيّم ${targetName}`} description="التقييم يساعد على رفع الالتزام والموثوقية.">
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="التقييم">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} من 5`}
            onClick={() => setScore(n)}
            className="cursor-pointer rounded-lg p-1.5 hover:bg-muted"
          >
            <Star className={cn('size-9', n <= score ? 'fill-accent text-accent' : 'text-input')} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-center text-sm font-medium text-muted-foreground">{LABELS[score]}</p>
      <div className="mt-4">
        <Field label="تعليق (اختياري)" htmlFor="comment">
          <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        </Field>
      </div>
      <div className="mt-4">
        <FormError error={rate.error} />
      </div>
      <Button block size="lg" className="mt-4" disabled={score === 0 || rate.isPending} onClick={() => rate.mutate()}>
        إرسال التقييم
      </Button>
    </Dialog>
  );
}
