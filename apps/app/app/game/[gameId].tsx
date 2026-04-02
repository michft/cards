import { useLocalSearchParams } from 'expo-router';

import { ClockGameScreen } from '../../src/screens/clock-game-screen';
import { FreeCellGameScreen } from '../../src/screens/freecell-game-screen';
import { KlondikeGameScreen } from '../../src/screens/klondike-game-screen';
import { PyramidGameScreen } from '../../src/screens/pyramid-game-screen';
import { SpiderGameScreen } from '../../src/screens/spider-game-screen';

export default function GameRoute() {
  const params = useLocalSearchParams<{ gameId?: string; mode?: string }>();
  const gameId = params.gameId ?? 'klondike';
  const mode = params.mode === 'resume' ? 'resume' : 'new';

  if (gameId === 'spider') {
    return <SpiderGameScreen mode={mode} />;
  }

  if (gameId === 'clock') {
    return <ClockGameScreen mode={mode} />;
  }

  if (gameId === 'freecell') {
    return <FreeCellGameScreen mode={mode} />;
  }

  if (gameId === 'pyramid') {
    return <PyramidGameScreen mode={mode} />;
  }

  return (
    <KlondikeGameScreen
      gameId={gameId}
      mode={mode}
    />
  );
}
