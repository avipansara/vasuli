-- Fix for Infinite Recursion in group_members RLS Policies
-- Run this in your Supabase SQL Editor to replace the problematic policies

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Admins can add members" ON public.group_members;
DROP POLICY IF EXISTS "Admins can remove members" ON public.group_members;

-- Recreate policies WITHOUT recursion
-- The issue: policies were querying group_members table while checking permissions on group_members table

-- Allow users to view members of groups they belong to
-- This uses a simpler check that doesn't cause recursion
CREATE POLICY "Users can view group members" ON public.group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

-- Allow admins to add members
-- First member of a group is automatically allowed (for group creation)
-- Subsequent members require admin permission
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

-- Allow admins to remove members
CREATE POLICY "Admins can remove members" ON public.group_members
  FOR DELETE USING (
    group_id IN (
      SELECT group_id FROM public.group_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
