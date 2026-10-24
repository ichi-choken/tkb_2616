import { Pressable, View } from 'react-native';
import { C, DESIGN_IDS, DESIGNS, selectDesign, useLayout } from './theme';
import { Row, Txt } from './ui';

// Comparison controls for the three requested design proposals, independent of app data.
export function DesignSwitcher() {
  const { s, design, wide } = useLayout();
  return <Row gap={wide ? 12 : 6} style={{ flex: wide ? undefined : 1 }}>
    {wide ? <Txt size={11} color={C.muted}>デザイン比較</Txt> : null}
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', flex: wide ? undefined : 1, gap: s(3), padding: s(4), borderRadius: s(12), borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}>
      {DESIGN_IDS.map(id => {
        const on = design.id === id;
        return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={`${DESIGNS[id].number} ${DESIGNS[id].name}`} accessibilityState={{ selected: on }} onPress={() => selectDesign(id)}
          style={({ pressed }) => ({ flex: wide ? undefined : 1, minHeight: s(34), paddingHorizontal: s(wide ? 16 : 8), borderRadius: s(9), backgroundColor: on ? C.card : 'transparent', opacity: pressed ? 0.7 : 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? C.line : 'transparent' })}>
          <Row gap={5}><Txt size={12} weight={on ? 'bold' : 'regular'} color={on ? C.ink : C.muted}>{DESIGNS[id].name}</Txt></Row>
        </Pressable>;
      })}
    </View>
  </Row>;
}
