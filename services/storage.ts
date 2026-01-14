import { supabase } from '@/lib/supabase';
import * as ExpoFileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const BUCKET_NAME = 'vasuli-images';

export interface UploadResult {
  url: string;
  path: string;
}

export const storageService = {
  async pickImage(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Permission to access media library was denied');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0].uri;
  },

  async takePhoto(): Promise<string | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Permission to access camera was denied');
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0].uri;
  },

  async uploadImage(
    localUri: string,
    folder: 'avatars' | 'receipts' | 'groups',
    fileName?: string
  ): Promise<UploadResult> {
    const fileExt = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const uniqueName = fileName || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filePath = `${folder}/${uniqueName}.${fileExt}`;

    // Read file as base64
    const base64 = await ExpoFileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    // Convert base64 to ArrayBuffer
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, bytes, {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      path: filePath,
    };
  },

  async uploadAvatar(localUri: string, userId: string): Promise<string> {
    const result = await this.uploadImage(localUri, 'avatars', userId);
    return result.url;
  },

  async uploadReceipt(localUri: string, expenseId: string): Promise<string> {
    const result = await this.uploadImage(localUri, 'receipts', expenseId);
    return result.url;
  },

  async uploadGroupImage(localUri: string, groupId: string): Promise<string> {
    const result = await this.uploadImage(localUri, 'groups', groupId);
    return result.url;
  },

  async deleteImage(path: string): Promise<void> {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) {
      throw error;
    }
  },

  getPublicUrl(path: string): string {
    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);
    return data.publicUrl;
  },
};

// Storage bucket setup SQL (run in Supabase SQL Editor):
/*
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('vasuli-images', 'vasuli-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vasuli-images');

-- Allow public read access
CREATE POLICY "Public read access for images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vasuli-images');

-- Allow users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vasuli-images' AND auth.uid()::text = (storage.foldername(name))[2]);
*/
