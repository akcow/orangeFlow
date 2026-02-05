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
  created_at: string;
  updated_at: string;
  user_name?: string | null;
  user_profile_image?: string | null;
};

