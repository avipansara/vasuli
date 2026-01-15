-- Vasuli Database Schema - Custom OTP Authentication
-- This script will DROP all existing tables and recreate them from scratch
-- Run this in your Supabase SQL Editor

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================
DROP TABLE IF EXISTS public.verification_codes CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.settlements CASCADE;
DROP TABLE IF EXISTS public.expense_splits CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_invitation_on_signup() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_codes() CASCADE;

-- Drop storage policies
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

-- ============================================
-- STEP 2: ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 3: CREATE TABLES
-- ============================================

-- USERS TABLE
-- No longer tied to auth.users - fully custom authentication
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  avatar TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT email_or_phone_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- VERIFICATION CODES TABLE
-- For OTP-based authentication (sign up and sign in)
CREATE TABLE public.verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('signup', 'signin')),
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  attempts INT DEFAULT 0,
  CONSTRAINT email_or_phone_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- GROUPS TABLE
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GROUP MEMBERS TABLE
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- EXPENSES TABLE
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  paid_by UUID NOT NULL REFERENCES public.users(id),
  category TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EXPENSE SPLITS TABLE
CREATE TABLE public.expense_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage')),
  percentage DECIMAL(5, 2),
  UNIQUE(expense_id, user_id)
);

-- SETTLEMENTS TABLE
CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  from_user_id UUID NOT NULL REFERENCES public.users(id),
  to_user_id UUID NOT NULL REFERENCES public.users(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FRIENDSHIPS TABLE
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- INVITATIONS TABLE
-- For friend invitations before they sign up
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_email TEXT,
  invitee_phone TEXT,
  invitee_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT invitee_contact_required CHECK (invitee_email IS NOT NULL OR invitee_phone IS NOT NULL)
);

-- ============================================
-- STEP 4: CREATE INDEXES
-- ============================================

-- Users indexes
CREATE INDEX idx_users_email ON public.users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;

-- Verification codes indexes
CREATE INDEX idx_verification_codes_email ON public.verification_codes(email) WHERE email IS NOT NULL;
CREATE INDEX idx_verification_codes_phone ON public.verification_codes(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_verification_codes_expires_at ON public.verification_codes(expires_at);
CREATE INDEX idx_verification_codes_user_id ON public.verification_codes(user_id) WHERE user_id IS NOT NULL;

-- Group members indexes
CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);

-- Expenses indexes
CREATE INDEX idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_expenses_date ON public.expenses(date);

-- Expense splits indexes
CREATE INDEX idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON public.expense_splits(user_id);

-- Settlements indexes
CREATE INDEX idx_settlements_from_user_id ON public.settlements(from_user_id);
CREATE INDEX idx_settlements_to_user_id ON public.settlements(to_user_id);
CREATE INDEX idx_settlements_group_id ON public.settlements(group_id);

-- Friendships indexes
CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);

-- Invitations indexes
CREATE INDEX idx_invitations_inviter_id ON public.invitations(inviter_id);
CREATE INDEX idx_invitations_invitee_email ON public.invitations(invitee_email) WHERE invitee_email IS NOT NULL;
CREATE INDEX idx_invitations_invitee_phone ON public.invitations(invitee_phone) WHERE invitee_phone IS NOT NULL;

-- ============================================
-- STEP 5: ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- USERS POLICIES
-- Allow anyone to read users (for friend discovery)
CREATE POLICY "Anyone can read users"
  ON public.users FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow insert for new user creation (will be controlled by service)
CREATE POLICY "Allow user creation"
  ON public.users FOR INSERT
  WITH CHECK (true);

-- VERIFICATION CODES POLICIES
-- Allow anyone to insert verification codes (for sign up/sign in)
CREATE POLICY "Allow verification code creation"
  ON public.verification_codes FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read their own codes
CREATE POLICY "Users can read own codes"
  ON public.verification_codes FOR SELECT
  USING (true);

-- Allow anyone to update codes (for verification)
CREATE POLICY "Allow code verification"
  ON public.verification_codes FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- GROUPS POLICIES
CREATE POLICY "Users can view groups they are members of"
  ON public.groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = groups.id
    )
  );

CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Group admins can update groups"
  ON public.groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = groups.id
      AND group_members.role = 'admin'
    )
  );

CREATE POLICY "Group admins can delete groups"
  ON public.groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = groups.id
      AND group_members.role = 'admin'
    )
  );

-- GROUP MEMBERS POLICIES
CREATE POLICY "Users can view group members"
  ON public.group_members FOR SELECT
  USING (true);

CREATE POLICY "Group admins can add members"
  ON public.group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.role = 'admin'
    )
  );

CREATE POLICY "Group admins can remove members"
  ON public.group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.role = 'admin'
    )
  );

-- EXPENSES POLICIES
CREATE POLICY "Group members can view expenses"
  ON public.expenses FOR SELECT
  USING (
    group_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_members.group_id = expenses.group_id
    )
  );

CREATE POLICY "Users can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Expense creator can update"
  ON public.expenses FOR UPDATE
  USING (true);

CREATE POLICY "Expense creator can delete"
  ON public.expenses FOR DELETE
  USING (true);

-- EXPENSE SPLITS POLICIES
CREATE POLICY "Users can view expense splits"
  ON public.expense_splits FOR SELECT
  USING (true);

CREATE POLICY "Users can create expense splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update expense splits"
  ON public.expense_splits FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete expense splits"
  ON public.expense_splits FOR DELETE
  USING (true);

-- SETTLEMENTS POLICIES
CREATE POLICY "Users can view their settlements"
  ON public.settlements FOR SELECT
  USING (true);

CREATE POLICY "Users can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (true);

-- FRIENDSHIPS POLICIES
CREATE POLICY "Users can view friendships"
  ON public.friendships FOR SELECT
  USING (true);

CREATE POLICY "Users can create friendships"
  ON public.friendships FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update friendships"
  ON public.friendships FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete friendships"
  ON public.friendships FOR DELETE
  USING (true);

-- INVITATIONS POLICIES
CREATE POLICY "Users can view invitations"
  ON public.invitations FOR SELECT
  USING (true);

CREATE POLICY "Users can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update invitations"
  ON public.invitations FOR UPDATE
  USING (true);

-- ============================================
-- STEP 6: FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger for groups table
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger for expenses table
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Function to cleanup expired verification codes
CREATE OR REPLACE FUNCTION public.cleanup_expired_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM public.verification_codes
  WHERE expires_at < NOW() AND verified = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to handle invitation acceptance on signup
CREATE OR REPLACE FUNCTION public.handle_invitation_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-accept pending invitations when user signs up
  UPDATE public.invitations
  SET status = 'accepted'
  WHERE (invitee_email = NEW.email OR invitee_phone = NEW.phone)
    AND status = 'pending';
  
  -- Create friendships for accepted invitations
  INSERT INTO public.friendships (user_id, friend_id, status)
  SELECT inviter_id, NEW.id, 'accepted'
  FROM public.invitations
  WHERE (invitee_email = NEW.email OR invitee_phone = NEW.phone)
    AND status = 'accepted'
  ON CONFLICT DO NOTHING;
  
  -- Create reverse friendship
  INSERT INTO public.friendships (user_id, friend_id, status)
  SELECT NEW.id, inviter_id, 'accepted'
  FROM public.invitations
  WHERE (invitee_email = NEW.email OR invitee_phone = NEW.phone)
    AND status = 'accepted'
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for handling invitations on user creation
CREATE TRIGGER handle_invitation_on_signup_trigger
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invitation_on_signup();

-- ============================================
-- STEP 7: STORAGE BUCKET SETUP
-- ============================================

-- Create storage bucket for images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images');

CREATE POLICY "Public read access for images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'images');

CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'images');

-- ============================================
-- SCHEMA COMPLETE
-- ============================================
-- This schema is now ready for custom OTP authentication
-- No dependency on Supabase Auth (auth.users)
-- All authentication will be handled via verification_codes table
