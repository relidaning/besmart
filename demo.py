class Solution:
  def lengthOfLongestSubstring(self, s: str) -> int:
    list = []
    cur_len = 0
    max_len = 0
    longest_str = ''
    for element in s:
      if element not in list:
        list.append(element)
        cur_len += 1
        if cur_len > max_len:
          max_len = cur_len
          longest_str = ''.join(list)
      else:
        list.append(element)
        list = list[list.index(element)+1:len(list)]
        cur_len = len(list)
    return max_len


c = Solution()
print(c.lengthOfLongestSubstring("abcabcbb"))
# list = ['a', 'b', 'c']
# print(list.index('b'))