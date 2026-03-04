export type CommunityItemType = "TV" | "WORKFLOW";
export type CommunityItemStatus = "PRIVATE" | "PUBLIC" | "UNREVIEWED";

export type CommunityItem = {
  id: string;
  type: CommunityItemType;
  status: CommunityItemStatus;
  title: string;
  description: string | null;
  flow_id: string;
  user_id: string;
  cover_path: string | null;
  media_path: string | null;
  public_canvas: boolean;
  view_count?: number;
  like_count?: number;
  created_at: string;
  updated_at: string;
  user_name?: string | null;
  user_profile_image?: string | null;
  last_review_action?: "APPROVE" | "REJECT" | "HIDE" | null;
  last_review_comment?: string | null;
  last_review_reviewer_name?: string | null;
  last_reviewed_at?: string | null;
};

export type CommunityReviewLog = {
  id: string;
  action: "APPROVE" | "REJECT" | "HIDE";
  from_status: CommunityItemStatus;
  to_status: CommunityItemStatus;
  comment?: string | null;
  reviewer_id: string;
  reviewer_name?: string | null;
  created_at: string;
};

export type CommunityReviewFlow = {
  id: string;
  name: string;
  description?: string | null;
  access_type: "PRIVATE" | "PUBLIC";
  updated_at?: string | null;
  data?: Record<string, unknown> | null;
};

export type CommunityReviewDetail = {
  item: CommunityItem;
  flow?: CommunityReviewFlow | null;
  logs: CommunityReviewLog[];
};

export type CommunityBatchReviewResult = {
  total_requested: number;
  processed_count: number;
  missing_item_ids: string[];
};
