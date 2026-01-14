// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Partial<Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>>;
export type IconSymbolName = SymbolViewProps['name'];

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING: IconMapping = {
  // Navigation
  'house.fill': 'home',
  'house': 'home',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'xmark': 'close',
  'xmark.circle.fill': 'cancel',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  
  // Actions
  'plus': 'add',
  'plus.circle': 'add-circle-outline',
  'plus.circle.fill': 'add-circle',
  'minus': 'remove',
  'minus.circle.fill': 'remove-circle',
  'checkmark': 'check',
  'checkmark.circle': 'check-circle-outline',
  'checkmark.circle.fill': 'check-circle',
  'paperplane.fill': 'send',
  'paperplane': 'send',
  'trash': 'delete-outline',
  'trash.fill': 'delete',
  'pencil': 'edit',
  'pencil.circle.fill': 'edit',
  'square.and.pencil': 'edit',
  
  // People
  'person': 'person-outline',
  'person.fill': 'person',
  'person.2': 'people-outline',
  'person.2.fill': 'people',
  'person.3': 'groups',
  'person.3.fill': 'groups',
  'person.badge.plus': 'person-add',
  'person.crop.circle': 'account-circle',
  'person.crop.circle.fill': 'account-circle',
  
  // Communication
  'envelope': 'mail-outline',
  'envelope.fill': 'mail',
  'phone': 'phone',
  'phone.fill': 'phone',
  'message': 'chat-bubble-outline',
  'message.fill': 'chat-bubble',
  
  // Finance
  'dollarsign.circle': 'attach-money',
  'dollarsign.circle.fill': 'attach-money',
  'creditcard': 'credit-card',
  'creditcard.fill': 'credit-card',
  'banknote': 'payments',
  'banknote.fill': 'payments',
  'divide.circle': 'pie-chart',
  
  // Documents
  'doc': 'description',
  'doc.fill': 'description',
  'doc.text': 'article',
  'doc.text.fill': 'article',
  'list.bullet': 'list',
  'list.bullet.rectangle': 'view-list',
  
  // Settings & System
  'gearshape': 'settings',
  'gearshape.fill': 'settings',
  'bell': 'notifications-none',
  'bell.fill': 'notifications',
  'lock': 'lock-outline',
  'lock.fill': 'lock',
  'lock.shield': 'security',
  'shield': 'shield',
  'shield.fill': 'shield',
  'info.circle': 'info-outline',
  'info.circle.fill': 'info',
  'questionmark.circle': 'help-outline',
  'questionmark.circle.fill': 'help',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning',
  
  // Media
  'photo': 'photo',
  'photo.fill': 'photo',
  'camera': 'camera-alt',
  'camera.fill': 'camera-alt',
  'qrcode': 'qr-code',
  'qrcode.viewfinder': 'qr-code-scanner',
  
  // Objects
  'cart': 'shopping-cart',
  'cart.fill': 'shopping-cart',
  'bag': 'shopping-bag',
  'bag.fill': 'shopping-bag',
  'fork.knife': 'restaurant',
  'cup.and.saucer': 'local-cafe',
  'cup.and.saucer.fill': 'local-cafe',
  
  // Places
  'airplane': 'flight',
  'car': 'directions-car',
  'car.fill': 'directions-car',
  'tram': 'tram',
  'tram.fill': 'tram',
  
  // Buildings
  'building.2': 'business',
  'building.2.fill': 'business',
  'briefcase': 'work-outline',
  'briefcase.fill': 'work',
  
  // Nature & Misc
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'star': 'star-border',
  'star.fill': 'star',
  'moon': 'dark-mode',
  'moon.fill': 'dark-mode',
  'sun.max': 'light-mode',
  'sun.max.fill': 'light-mode',
  'paintbrush': 'brush',
  'paintbrush.fill': 'brush',
  
  // Arrows & Indicators
  'arrow.up': 'arrow-upward',
  'arrow.down': 'arrow-downward',
  'arrow.clockwise': 'refresh',
  'arrow.trianglehead.2.clockwise': 'sync',
  'arrow.up.arrow.down': 'swap-vert',
  
  // Misc
  'rectangle.portrait.and.arrow.right': 'logout',
  'chevron.left.forwardslash.chevron.right': 'code',
  'gamecontroller': 'sports-esports',
  'gamecontroller.fill': 'sports-esports',
  'wifi': 'wifi',
  'wifi.slash': 'wifi-off',
  'globe': 'language',
  'clock': 'schedule',
  'clock.fill': 'schedule',
  'calendar': 'calendar-today',
  'calendar.badge.plus': 'event',
  'bolt': 'flash-on',
  'bolt.fill': 'flash-on',
  'sparkles': 'auto-awesome',
  'wand.and.stars': 'auto-fix-high',
};

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const mappedName = MAPPING[name] || 'help-outline';
  return <MaterialIcons color={color} size={size} name={mappedName} style={style} />;
}
