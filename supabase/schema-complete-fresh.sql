-- ============================================
-- VASULI DATABASE SCHEMA - COMPLETE FRESH START
-- ============================================
-- This script will DROP all existing tables and recreate them from scratch
-- Designed for custom OTP authentication (not Supabase Auth)
-- Run this in your Supabase SQL Editor
--
-- IMPORTANT: This will delete ALL existing data!
-- ============================================

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================
DROP TABLE IF EXISTS public.activities CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.settlements CASCADE;
DROP TABLE IF EXISTS public.expense_splits CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.verification_codes CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_invitation_on_signup() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- ============================================
-- STEP 2: ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 3: CREATE ALL TABLES
-- ============================================

-- USERS TABLE
-- Note: Using UUID for compatibility with auth.users if needed later
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  avatar TEXT,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- VERIFICATION CODES TABLE
-- For OTP authentication (created after users table due to foreign key)
CREATE TABLE public.verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('signup', 'signin')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
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

-- ACTIVITIES TABLE
-- Event log for all activities (expenses, settlements, groups, etc.)
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN (
    'expense_created', 'expense_updated', 'expense_deleted',
    'settlement_created', 'settlement_deleted',
    'group_created', 'group_updated', 'member_added', 'member_removed'
  )),
  user_id UUID NOT NULL REFERENCES public.users(id),
  user_name TEXT,
  target_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  group_name TEXT,
  description TEXT NOT NULL,
  amount DECIMAL(10, 2),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: CREATE RLS POLICIES (PERMISSIVE FOR CUSTOM OTP AUTH)
-- ============================================
-- Since we use custom OTP authentication (not Supabase auth.uid()),
-- we create permissive policies that allow all operations.
-- You can tighten these later based on your security requirements.

-- VERIFICATION CODES POLICIES
CREATE POLICY "Allow all operations on verification_codes" ON public.verification_codes
  FOR ALL USING (true);

-- USERS POLICIES
CREATE POLICY "Allow all operations on users" ON public.users
  FOR ALL USING (true);

-- GROUPS POLICIES
CREATE POLICY "Allow all operations on groups" ON public.groups
  FOR ALL USING (true);

-- GROUP MEMBERS POLICIES
CREATE POLICY "Allow all operations on group_members" ON public.group_members
  FOR ALL USING (true);

-- EXPENSES POLICIES
CREATE POLICY "Allow all operations on expenses" ON public.expenses
  FOR ALL USING (true);

-- EXPENSE SPLITS POLICIES
CREATE POLICY "Allow all operations on expense_splits" ON public.expense_splits
  FOR ALL USING (true);

-- SETTLEMENTS POLICIES
CREATE POLICY "Allow all operations on settlements" ON public.settlements
  FOR ALL USING (true);

-- FRIENDSHIPS POLICIES
CREATE POLICY "Allow all operations on friendships" ON public.friendships
  FOR ALL USING (true);

-- INVITATIONS POLICIES
CREATE POLICY "Allow all operations on invitations" ON public.invitations
  FOR ALL USING (true);

-- ACTIVITIES POLICIES
CREATE POLICY "Allow all reads from activities" ON public.activities
  FOR SELECT USING (true);

CREATE POLICY "Allow all inserts to activities" ON public.activities
  FOR INSERT WITH CHECK (true);

-- ============================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_verification_codes_email ON public.verification_codes(email);
CREATE INDEX idx_verification_codes_phone ON public.verification_codes(phone);
CREATE INDEX idx_verification_codes_expires_at ON public.verification_codes(expires_at);
CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_expenses_date ON public.expenses(date DESC);
CREATE INDEX idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON public.expense_splits(user_id);
CREATE INDEX idx_settlements_from_user ON public.settlements(from_user_id);
CREATE INDEX idx_settlements_to_user ON public.settlements(to_user_id);
CREATE INDEX idx_settlements_group_id ON public.settlements(group_id);
CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX idx_invitations_inviter ON public.invitations(inviter_id);
CREATE INDEX idx_invitations_email ON public.invitations(invitee_email);
CREATE INDEX idx_invitations_status ON public.invitations(status);
CREATE INDEX idx_activities_created_at ON public.activities(created_at DESC);
CREATE INDEX idx_activities_user_id ON public.activities(user_id);
CREATE INDEX idx_activities_group_id ON public.activities(group_id);

-- ============================================
-- STEP 7: CREATE FUNCTIONS AND TRIGGERS
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

-- ============================================
-- DONE!
-- ============================================
-- Your database is now ready with:
-- ✅ All tables created with proper constraints
-- ✅ RLS enabled with permissive policies for custom OTP auth
-- ✅ Performance indexes on all foreign keys and common queries
-- ✅ Auto-updating timestamps on groups and expenses
-- ✅ All columns including image_url
-- ============================================
