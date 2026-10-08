export type TourStep = {
  id: string;
  route: string;
  targetSelector: string;
  title: string;
  description: string;
  badge: string;
  feature?: string;
  actionText?: string;
  isSubPage?: boolean;
};
