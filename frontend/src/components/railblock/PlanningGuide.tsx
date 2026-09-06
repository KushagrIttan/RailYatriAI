import { CheckCircle2, ClipboardList, Route, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS = [
  { icon: ClipboardList, title: "Choose a maintenance request", description: "Start with a request that needs a planning decision." },
  { icon: Wrench, title: "Review the suggested time", description: "The timeline shows a possible maintenance time and the trains scheduled around it." },
  { icon: Route, title: "Check the train timetable", description: "Train bars come from the saved timetable used by this scenario." },
  { icon: CheckCircle2, title: "Record a prototype decision", description: "Accept, reject, or adjust the suggested plan. This does not change real railway operations." },
];

export function PlanningGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>How this planning scenario works</DialogTitle>
          <DialogDescription>Use saved train times and simulated maintenance requests to explore safer work timings.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-success/12 text-success"><Icon className="size-4" /></div>
                <div>
                  <p className="text-sm font-medium"><span className="num mr-2 text-success">{index + 1}.</span>{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>Got it</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
