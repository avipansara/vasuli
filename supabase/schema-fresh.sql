-- Vasuli Database Schema - Fresh Start
-- This script will DROP all existing tables and recreate them from scratch
-- Run this in your Supabase SQL Editor

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================
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
-- STEP 3: CREATE ALL TABLES
-- ============================================

-- USERS TABLE
-- Tied to auth.users for authenticated users
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GROUPS TABLE
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
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
  invitee_email TEXT NOT NULL,
  invitee_phone TEXT,
  invitee_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE(inviter_id, invitee_email)
);

-- ============================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: CREATE RLS POLICIES
-- ============================================

-- USERS POLICIES
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- GROUPS POLICIES
CREATE POLICY "Users can view their groups" ON public.groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_members 
      WHERE group_members.group_id = groups.id 
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create groups" ON public.groups
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update groups" ON public.groups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.group_members 
      WHERE group_members.group_id = groups.id 
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete groups" ON public.groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_members 
      WHERE group_members.group_id = groups.id 
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'admin'
    )
  );

-- GROUP MEMBERS POLICIES (Fixed for no recursion)
CREATE POLICY "Users can view group members" ON public.group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can add members" ON public.group_members
  FOR INSERT WITH CHECK (
    -- Allow if user is adding themselves as first member (group creation)
    NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id)
    OR
    -- Allow if current user is an admin of this group
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can remove members" ON public.group_members
  FOR DELETE USING (
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- EXPENSES POLICIES
CREATE POLICY "Users can view their expenses" ON public.expenses
  FOR SELECT USING (
    paid_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.expense_splits 
      WHERE expense_splits.expense_id = expenses.id 
      AND expense_splits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (paid_by = auth.uid());

CREATE POLICY "Creator can update expenses" ON public.expenses
  FOR UPDATE USING (paid_by = auth.uid());

CREATE POLICY "Creator can delete expenses" ON public.expenses
  FOR DELETE USING (paid_by = auth.uid());

-- EXPENSE SPLITS POLICIES
CREATE POLICY "Users can view their splits" ON public.expense_splits
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.expenses 
      WHERE expenses.id = expense_splits.expense_id 
      AND expenses.paid_by = auth.uid()
    )
  );

CREATE POLICY "Creator can manage splits" ON public.expense_splits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.expenses 
      WHERE expenses.id = expense_splits.expense_id 
      AND expenses.paid_by = auth.uid()
    )
  );

-- SETTLEMENTS POLICIES
CREATE POLICY "Users can view their settlements" ON public.settlements
  FOR SELECT USING (
    from_user_id = auth.uid() OR to_user_id = auth.uid()
  );

CREATE POLICY "Users can create settlements" ON public.settlements
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

-- FRIENDSHIPS POLICIES
CREATE POLICY "Users can view their friendships" ON public.friendships
  FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can accept/reject friendships" ON public.friendships
  FOR UPDATE USING (friend_id = auth.uid());

-- INVITATIONS POLICIES
CREATE POLICY "Users can view their invitations" ON public.invitations
  FOR SELECT USING (
    inviter_id = auth.uid()
    OR invitee_email = (SELECT email FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Users can create invitations" ON public.invitations
  FOR INSERT WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "Users can update received invitations" ON public.invitations
  FOR UPDATE USING (
    invitee_email = (SELECT email FROM public.users WHERE id = auth.uid())
  );

-- ============================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_expenses_date ON public.expenses(date DESC);
CREATE INDEX idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON public.expense_splits(user_id);
CREATE INDEX idx_settlements_from_user ON public.settlements(from_user_id);
CREATE INDEX idx_settlements_to_user ON public.settlements(to_user_id);
CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX idx_invitations_inviter ON public.invitations(inviter_id);
CREATE INDEX idx_invitations_email ON public.invitations(invitee_email);
CREATE INDEX idx_invitations_status ON public.invitations(status);

-- ============================================
-- STEP 7: CREATE FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to auto-accept invitations on signup
CREATE OR REPLACE FUNCTION public.handle_invitation_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new user signs up, automatically accept any pending invitations
  -- and create friendships
  INSERT INTO public.friendships (user_id, friend_id, status)
  SELECT 
    NEW.id,
    i.inviter_id,
    'accepted'
  FROM public.invitations i
  WHERE i.invitee_email = NEW.email
    AND i.status = 'pending'
  ON CONFLICT DO NOTHING;

  -- Also create the reverse friendship
  INSERT INTO public.friendships (user_id, friend_id, status)
  SELECT 
    i.inviter_id,
    NEW.id,
    'accepted'
  FROM public.invitations i
  WHERE i.invitee_email = NEW.email
    AND i.status = 'pending'
  ON CONFLICT DO NOTHING;

  -- Mark invitations as accepted
  UPDATE public.invitations
  SET status = 'accepted'
  WHERE invitee_email = NEW.email
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-accept invitations when user signs up
CREATE TRIGGER on_user_signup_accept_invitations
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_on_signup();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- STEP 8: CREATE STORAGE BUCKET
-- ============================================

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('vasuli-images', 'vasuli-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vasuli-images');

-- Allow public read access for images
CREATE POLICY "Public read access for images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vasuli-images');

-- Allow users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vasuli-images');

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vasuli-images');

-- ============================================
-- DONE! Your database is ready to use.
-- ============================================
